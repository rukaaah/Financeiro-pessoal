"""A migration 001 recusa papéis com atributo perigoso?

Antes havia aqui dois `ALTER ROLE ... NOSUPERUSER ...`, que corrigiam o papel
em silêncio. Eles quebravam no Neon — mexer no atributo SUPERUSER exige **ser**
superusuário, e o `neondb_owner` não é — e, pior, escondiam o problema quando
funcionavam: um papel `app` com BYPASSRLS anula todas as policies de uma vez.

Os testes extraem o bloco de guarda do **próprio arquivo de migration**, em vez
de copiá-lo, para não haver duas versões capazes de divergir.
"""

import re
from pathlib import Path

import psycopg
import pytest

from tests.integration.conftest import Conexao

pytestmark = pytest.mark.integration

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "001-identidade-e-rls.sql"
MARCADOR = "guarda-de-atributos-dos-papeis"


def _guarda() -> str:
    """O bloco DO da migration, recortado pelos marcadores."""
    sql = MIGRATION.read_text(encoding="utf-8")
    trecho = re.search(
        rf"-- marcador: {MARCADOR} \(início\)\n(.*?)-- marcador: {MARCADOR} \(fim\)",
        sql,
        re.DOTALL,
    )
    assert trecho is not None, f"marcadores ausentes em {MIGRATION.name}"
    return trecho.group(1)


def test_os_marcadores_continuam_no_arquivo() -> None:
    """Se alguém reescrever a migration sem eles, os testes abaixo viram vácuo."""
    assert "rolbypassrls" in _guarda()


def test_a_guarda_passa_com_os_papeis_como_a_migration_os_cria(conn: Conexao) -> None:
    with conn.cursor() as cur:
        cur.execute(_guarda())  # não levanta


@pytest.mark.parametrize(
    ("papel", "atributo"),
    [
        ("app", "BYPASSRLS"),
        ("app", "SUPERUSER"),
        ("app", "CREATEROLE"),
        ("app", "CREATEDB"),
        ("jobs", "BYPASSRLS"),
    ],
)
def test_a_guarda_recusa_papel_com_atributo_perigoso(
    conn: Conexao, papel: str, atributo: str
) -> None:
    """Alterar papel é transacional no PostgreSQL, então o rollback do teste desfaz."""
    with conn.cursor() as cur:
        cur.execute(f"ALTER ROLE {papel} {atributo}")

        with pytest.raises(psycopg.errors.InsufficientPrivilege) as erro:
            cur.execute(_guarda())

    mensagem = str(erro.value)
    assert papel in mensagem
    assert atributo in mensagem
    assert "BYPASSRLS anula todas as policies" in mensagem


def test_a_mensagem_diz_como_corrigir(conn: Conexao) -> None:
    """Erro de migration que não diz o que fazer custa tempo de quem está publicando."""
    with conn.cursor() as cur:
        cur.execute("ALTER ROLE app BYPASSRLS")
        with pytest.raises(psycopg.errors.InsufficientPrivilege) as erro:
            cur.execute(_guarda())

    assert "ALTER ROLE app NO<atributo>" in str(erro.value)


def test_o_rollback_devolve_o_papel_ao_estado_seguro(conn: Conexao) -> None:
    """Confirma a premissa dos testes acima: DDL de papel é desfeita pelo rollback."""
    with conn.cursor() as cur:
        cur.execute("ALTER ROLE app BYPASSRLS")
        cur.execute("SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app'")
        assert cur.fetchone() == (True,)

    conn.rollback()

    with conn.cursor() as cur:
        cur.execute("SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app'")
        assert cur.fetchone() == (False,), (
            "o rollback não desfez o atributo — os outros testes deste arquivo "
            "estariam deixando o papel `app` perigoso para o resto da suíte"
        )


def test_a_migration_nao_tenta_mais_alterar_atributos_de_papel(conn: Conexao) -> None:
    """O `ALTER ROLE ... NOSUPERUSER` falha no Neon, onde o aplicador não é superusuário."""
    sql = MIGRATION.read_text(encoding="utf-8")
    comandos = [
        linha.strip()
        for linha in sql.splitlines()
        if linha.strip().upper().startswith("ALTER ROLE")
    ]
    assert comandos == [], f"ALTER ROLE em atributos de papel não roda no Neon: {comandos}"
