"""O seed do demo produz dados coerentes e pode rodar toda noite?

Duas propriedades importam, e nenhuma é sobre valores específicos:

- **idempotência**, porque o workflow noturno roda sobre o resultado da noite
  anterior e não pode acumular lixo nem falhar por chave duplicada;
- **coerência**, porque os dados são a primeira impressão do sistema e o banco
  é quem garante os invariantes — se o seed passar, é porque os respeitou.
"""

import importlib.util
import itertools
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import ModuleType

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app

pytestmark = pytest.mark.integration

RAIZ = Path(__file__).resolve().parents[2]


def _carrega_seed() -> ModuleType:
    """Importa scripts/seed_demo.py, que não é um pacote instalável."""
    caminho = RAIZ / "scripts" / "seed_demo.py"
    spec = importlib.util.spec_from_file_location("seed_demo", caminho)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    sys.modules["seed_demo"] = modulo
    spec.loader.exec_module(modulo)
    return modulo


seed = _carrega_seed()

# Data fixa: o seed monta três meses a partir de "hoje", e um teste que
# dependesse da data real mudaria de resultado conforme o dia em que roda.
HOJE = date(2026, 10, 20)


@pytest.fixture
def demo(conn: Conexao) -> uuid.UUID:
    seed.semear(conn, HOJE)
    return uuid.UUID(str(seed.USUARIO))


def _conta(conn: Conexao, sql: str, params: tuple[object, ...] = ()) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        linha = cur.fetchone()
    assert linha is not None
    valor = linha[0]
    assert isinstance(valor, int)
    return valor


def test_cria_exatamente_um_usuario_demo(conn: Conexao, demo: uuid.UUID) -> None:
    assert _conta(conn, "SELECT count(*) FROM app_users WHERE is_demo AND active") == 1


def test_o_demo_e_alcancavel_pela_funcao_de_roteamento(conn: Conexao, demo: uuid.UUID) -> None:
    """É por `demo_app_user()` que o visitante fora da allowlist chega aqui (ADR-003)."""
    with conn.cursor() as cur:
        cur.execute("SELECT demo_app_user()")
        assert cur.fetchone() == (demo,)


def test_rodar_duas_vezes_nao_acumula_nem_falha(conn: Conexao, demo: uuid.UUID) -> None:
    """O workflow noturno roda sobre o resultado da noite anterior."""
    antes = _conta(conn, "SELECT count(*) FROM transactions WHERE user_id = %s", (demo,))
    seed.semear(conn, HOJE)
    depois = _conta(conn, "SELECT count(*) FROM transactions WHERE user_id = %s", (demo,))
    assert depois == antes > 0
    assert _conta(conn, "SELECT count(*) FROM app_users WHERE is_demo") == 1


def test_os_invariantes_do_banco_valem_para_os_dados_do_demo(
    conn: Conexao, demo: uuid.UUID
) -> None:
    """Força a verificação dos triggers deferidos sobre tudo o que foi criado."""
    with conn.cursor() as cur:
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cur.execute(
            "SELECT transfer_id, sum(amount) FROM transactions"
            " WHERE user_id = %s AND transfer_id IS NOT NULL"
            " GROUP BY transfer_id HAVING sum(amount) <> 0",
            (demo,),
        )
        assert cur.fetchall() == [], "há transferência que não soma zero"


def test_nenhum_pagamento_de_fatura_tem_mes_de_fatura(conn: Conexao, demo: uuid.UUID) -> None:
    """ADR-007: pagamento não é compra."""
    assert (
        _conta(
            conn,
            "SELECT count(*) FROM transactions"
            " WHERE user_id = %s AND kind = 'transfer' AND invoice_month IS NOT NULL",
            (demo,),
        )
        == 0
    )


def test_toda_fatura_tem_total_negativo(conn: Conexao, demo: uuid.UUID) -> None:
    """O sintoma que denunciou o bug do ADR-007 não pode reaparecer no demo."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT invoice_month, sum(amount) FROM transactions"
            " WHERE user_id = %s AND invoice_month IS NOT NULL"
            " GROUP BY invoice_month HAVING sum(amount) >= 0",
            (demo,),
        )
        assert cur.fetchall() == [], "fatura com total não-negativo"


def test_a_virada_do_ciclo_aparece_nos_dados(conn: Conexao, demo: uuid.UUID) -> None:
    """Duas compras com um dia de diferença caem em faturas diferentes.

    É a regra do ADR-007 visível para quem explorar o demo, não só no teste.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT occurred_on, invoice_month FROM transactions"
            " WHERE user_id = %s AND description LIKE 'Compra no dia%%'"
            " ORDER BY occurred_on",
            (demo,),
        )
        linhas = cur.fetchall()

    assert len(linhas) >= 2
    for anterior, seguinte in itertools.pairwise(linhas):
        dia_anterior, fatura_anterior = anterior
        dia_seguinte, fatura_seguinte = seguinte
        assert isinstance(dia_anterior, date) and isinstance(dia_seguinte, date)
        if (dia_seguinte - dia_anterior).days == 1:
            assert fatura_anterior != fatura_seguinte, (
                f"{dia_anterior} e {dia_seguinte} deveriam cair em faturas diferentes"
            )
            break
    else:
        pytest.fail("o demo não tem o par de compras que atravessa a virada da fatura")


def test_ha_saldo_a_receber_em_aberto(conn: Conexao, demo: uuid.UUID) -> None:
    """Sem isso a tela de valores a receber abriria zerada (RF17)."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sum(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id"
            " WHERE t.user_id = %s AND a.kind = 'receivable'",
            (demo,),
        )
        linha = cur.fetchone()
    assert linha is not None
    assert isinstance(linha[0], Decimal) and linha[0] > 0


def test_o_cartao_tem_fatura_em_aberto_e_faturas_pagas(conn: Conexao, demo: uuid.UUID) -> None:
    """Um demo onde tudo já está pago não mostra o que o sistema faz."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT sum(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id"
            " WHERE t.user_id = %s AND a.kind = 'credit_card'",
            (demo,),
        )
        linha = cur.fetchone()
    assert linha is not None
    assert isinstance(linha[0], Decimal) and linha[0] < 0, "nada em aberto no cartão"

    assert (
        _conta(
            conn,
            "SELECT count(*) FROM transactions"
            " WHERE user_id = %s AND description LIKE 'Pagamento da fatura%%'",
            (demo,),
        )
        > 0
    ), "nenhuma fatura paga"


def test_o_demo_e_isolado_como_qualquer_usuario(conn: Conexao, demo: uuid.UUID) -> None:
    """O modo demo não é caminho paralelo: é outro user_id sob a mesma RLS (ADR-003)."""
    with conn.cursor() as cur:
        intrusa = uuid.uuid4()
        cur.execute(
            "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, 'Intrusa')",
            (intrusa, f"{intrusa}@exemplo.com"),
        )
        como_app(cur, intrusa)
        cur.execute("SELECT count(*) FROM transactions")
        assert cur.fetchone() == (0,)


def test_nao_inventa_lancamento_no_futuro(conn: Conexao, demo: uuid.UUID) -> None:
    assert (
        _conta(
            conn,
            "SELECT count(*) FROM transactions WHERE user_id = %s AND occurred_on > %s",
            (demo, HOJE),
        )
        == 0
    )


def test_erro_do_banco_nao_deixa_demo_pela_metade(conn: Conexao) -> None:
    """O seed roda numa transação só: ou o demo inteiro existe, ou nenhum."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM app_users WHERE is_demo")
        antes = cur.fetchone()
    assert antes == (0,)

    with pytest.raises(psycopg.Error):
        seed.semear(conn, date(1900, 1, 1))  # fora de qualquer vigência de account_terms

    conn.rollback()
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM app_users WHERE is_demo")
        assert cur.fetchone() == (0,)
