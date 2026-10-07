"""Dois usuários, todas as tabelas: ninguém enxerga nada do outro.

Este é o teste que o CI roda a cada PR e o que mais importa num app público
(ADR-004). Ele tem duas metades que se complementam:

- a **estrutural** varre o catálogo do Postgres e cobra RLS e policy de toda
  tabela que tenha `user_id`. Como ela descobre as tabelas sozinha, uma tabela
  nova numa migration futura já nasce coberta: se vier sem RLS, o teste quebra
  sem que ninguém precise lembrar de atualizá-lo;
- a **comportamental** popula as duas contas por inteiro e confere, tabela por
  tabela, que cada papel `app` só alcança as próprias linhas.
"""

import uuid
from datetime import date
from decimal import Decimal

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app

pytestmark = pytest.mark.integration

Cursor = psycopg.Cursor[tuple[object, ...]]

# app_users é a própria tabela de usuários: a coluna que a identifica é `id`.
COLUNA_DONO = {"app_users": "id"}


def _tabelas_por_usuario(cur: Cursor) -> list[str]:
    """Tabelas que guardam dado de usuário, descobertas no catálogo."""
    cur.execute(
        """
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relname NOT LIKE '%%yoyo%%'
           AND (
                c.relname = 'app_users'
                OR EXISTS (
                    SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = c.oid
                       AND a.attname = 'user_id'
                       AND NOT a.attisdropped
                )
               )
         ORDER BY c.relname
        """
    )
    return [str(linha[0]) for linha in cur.fetchall()]


def _conta(cur: Cursor, sql: str, params: tuple[object, ...] = ()) -> int:
    """Executa um COUNT e devolve um int de verdade.

    O cursor do psycopg devolve `tuple[object, ...]`, então comparar o valor
    direto não passa no mypy strict.
    """
    cur.execute(sql, params)
    linha = cur.fetchone()
    assert linha is not None, f"consulta não devolveu linha: {sql}"
    valor = linha[0]
    assert isinstance(valor, int), f"esperava contagem inteira, veio {valor!r}"
    return valor


def _povoa(cur: Cursor, nome: str) -> uuid.UUID:
    """Cria um usuário com pelo menos uma linha em cada tabela do modelo."""
    usuario = uuid.uuid4()
    cur.execute(
        "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, %s)",
        (usuario, f"{usuario}@exemplo.com", nome),
    )

    pessoa, corrente, cartao, receber, grupo, categoria = (uuid.uuid4() for _ in range(6))

    cur.execute(
        "INSERT INTO counterparties (id, user_id, name) VALUES (%s, %s, %s)",
        (pessoa, usuario, f"Contraparte de {nome}"),
    )
    cur.executemany(
        "INSERT INTO accounts (id, user_id, name, kind, counterparty_id)"
        " VALUES (%s, %s, %s, %s, %s)",
        [
            (corrente, usuario, "PicPay", "checking", None),
            (cartao, usuario, "Unicred", "credit_card", None),
            (receber, usuario, "A receber", "receivable", pessoa),
        ],
    )
    cur.execute(
        "INSERT INTO account_terms (user_id, account_id, vigencia, cycle_start_day, due_day)"
        " VALUES (%s, %s, '[2020-01-01,)', 23, 30)",
        (usuario, cartao),
    )
    cur.execute(
        "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, %s)",
        (grupo, usuario, "Essenciais"),
    )
    cur.execute(
        "INSERT INTO categories (id, user_id, group_id, name, kind)"
        " VALUES (%s, %s, %s, %s, 'expense')",
        (categoria, usuario, grupo, "Mercado"),
    )

    transfer = uuid.uuid4()
    cur.executemany(
        "INSERT INTO transactions"
        " (user_id, kind, account_id, category_id, amount, occurred_on, transfer_id)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        [
            (usuario, "expense", cartao, categoria, Decimal("-100.00"), date(2026, 3, 10), None),
            (usuario, "income", corrente, categoria, Decimal("250.00"), date(2026, 3, 5), None),
            (usuario, "transfer", corrente, None, Decimal("-50.00"), date(2026, 3, 30), transfer),
            (usuario, "transfer", cartao, None, Decimal("50.00"), date(2026, 3, 30), transfer),
        ],
    )
    return usuario


@pytest.fixture
def duas_contas(conn: Conexao) -> tuple[uuid.UUID, uuid.UUID]:
    with conn.cursor() as cur:
        a = _povoa(cur, "Usuária A")
        b = _povoa(cur, "Usuário B")
        # Valida as transferências antes de qualquer teste assumir o papel `app`.
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
    return a, b


# ------------------------------------------------------------ estrutural


def test_toda_tabela_de_usuario_tem_rls_e_policy(conn: Conexao) -> None:
    """Descobre as tabelas no catálogo, então uma tabela nova já nasce coberta."""
    with conn.cursor() as cur:
        tabelas = _tabelas_por_usuario(cur)
        assert len(tabelas) >= 7, f"esperava o modelo inteiro, encontrei {tabelas}"

        sem_rls: list[str] = []
        sem_policy: list[str] = []
        for tabela in tabelas:
            cur.execute("SELECT relrowsecurity FROM pg_class WHERE relname = %s", (tabela,))
            linha = cur.fetchone()
            if linha is None or linha[0] is not True:
                sem_rls.append(tabela)
            cur.execute(
                "SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid"
                " WHERE c.relname = %s",
                (tabela,),
            )
            contagem = cur.fetchone()
            if contagem is None or contagem[0] == 0:
                sem_policy.append(tabela)

        assert sem_rls == [], f"tabelas sem RLS: {sem_rls}"
        assert sem_policy == [], f"tabelas sem policy: {sem_policy}"


def test_papel_app_nunca_ganha_bypassrls(conn: Conexao) -> None:
    """Um único ALTER ROLE descuidado anularia todas as policies de uma vez."""
    with conn.cursor() as cur:
        cur.execute("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('app', 'jobs')")
        assert cur.fetchall() == [(False, False), (False, False)]


# -------------------------------------------------------- comportamental


def test_cada_usuario_so_enxerga_as_proprias_linhas(
    conn: Conexao, duas_contas: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """A varredura completa: para cada tabela, nenhuma linha alheia aparece."""
    a, b = duas_contas
    with conn.cursor() as cur:
        tabelas = _tabelas_por_usuario(cur)

    for dono, intruso in ((a, b), (b, a)):
        with conn.cursor() as cur:
            # RESET ROLE, e não rollback: trocar de papel não pode desfazer os
            # dados da fixture, que vivem nesta mesma transação.
            cur.execute("RESET ROLE")
            como_app(cur, dono)
            for tabela in tabelas:
                coluna = COLUNA_DONO.get(tabela, "user_id")
                proprias = _conta(
                    cur, f"SELECT count(*) FROM {tabela} WHERE {coluna} <> %s", (intruso,)
                )
                alheias = _conta(
                    cur, f"SELECT count(*) FROM {tabela} WHERE {coluna} = %s", (intruso,)
                )

                assert alheias == 0, f"{tabela}: {dono} enxergou linha de {intruso}"
                assert proprias > 0, (
                    f"{tabela}: {dono} não enxergou as próprias linhas — "
                    "o teste ficaria verde por vacuidade"
                )


def test_sem_contexto_nenhuma_tabela_devolve_linha(
    conn: Conexao, duas_contas: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """Esquecer o `SET LOCAL` devolve vazio em tudo, nunca dado de alguém."""
    with conn.cursor() as cur:
        tabelas = _tabelas_por_usuario(cur)
        como_app(cur)  # sem app.user_id
        for tabela in tabelas:
            assert _conta(cur, f"SELECT count(*) FROM {tabela}") == 0, (
                f"{tabela} devolveu linha sem contexto de usuário"
            )


def test_nenhum_usuario_escreve_no_nome_do_outro(
    conn: Conexao, duas_contas: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """O `WITH CHECK` das policies, conferido nas tabelas que o `app` escreve."""
    a, b = duas_contas
    escrevíveis = ["counterparties", "accounts", "category_groups"]

    for tabela in escrevíveis:
        with conn.cursor() as cur:
            cur.execute("RESET ROLE")
            como_app(cur, a)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                if tabela == "accounts":
                    cur.execute(
                        "INSERT INTO accounts (user_id, name, kind) VALUES (%s, %s, 'checking')",
                        (b, f"intrusa em {tabela}"),
                    )
                else:
                    cur.execute(
                        f"INSERT INTO {tabela} (user_id, name) VALUES (%s, %s)",
                        (b, f"intrusa em {tabela}"),
                    )
        # A policy aborta a transação; o savepoint devolve ela utilizável.
        conn.rollback()


def test_um_usuario_nao_apaga_dado_do_outro(
    conn: Conexao, duas_contas: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """DELETE sem linha visível não apaga nada — e não acusa erro, apenas não age."""
    a, b = duas_contas
    with conn.cursor() as cur:
        como_app(cur, a)
        cur.execute("DELETE FROM transactions WHERE user_id = %s", (b,))
        assert cur.rowcount == 0

        cur.execute("RESET ROLE")
        restantes = _conta(cur, "SELECT count(*) FROM transactions WHERE user_id = %s", (b,))
        assert restantes == 4, "as linhas de B deveriam seguir lá"
