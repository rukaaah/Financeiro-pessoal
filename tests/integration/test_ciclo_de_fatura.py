"""O ciclo da fatura, fixado pelos dois cartões reais (ADR-008).

Os números são os que o app do banco mostra, sem conversão, e o dia do
fechamento é inclusivo: a compra feita nele ainda entra na fatura que fecha
naquele dia. As datas concretas abaixo são o contrato — não o nome da coluna,
que já mudou duas vezes.
"""

import uuid
from datetime import date
from decimal import Decimal

import psycopg
import pytest

from tests.integration.conftest import Conexao

pytestmark = pytest.mark.integration

Cursor = psycopg.Cursor[tuple[object, ...]]


def _usuario(cur: Cursor) -> uuid.UUID:
    user_id = uuid.uuid4()
    cur.execute(
        "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, 'Teste')",
        (user_id, f"{user_id}@exemplo.com"),
    )
    return user_id


def _cartao(cur: Cursor, user_id: uuid.UUID, nome: str, fecha: int, vence: int) -> uuid.UUID:
    conta = uuid.uuid4()
    cur.execute(
        "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, %s, 'credit_card')",
        (conta, user_id, nome),
    )
    cur.execute(
        "INSERT INTO account_terms (user_id, account_id, vigencia, closing_day, due_day)"
        " VALUES (%s, %s, '[2020-01-01,)', %s, %s)",
        (user_id, conta, fecha, vence),
    )
    return conta


def _fatura_de(cur: Cursor, conta: uuid.UUID, compra: date) -> date:
    cur.execute("SELECT invoice_month_for(%s, %s, NULL)", (conta, compra))
    linha = cur.fetchone()
    assert linha is not None
    valor = linha[0]
    assert isinstance(valor, date)
    return valor


# Unicred: fecha 4, vence 11, os números do app do banco. Como 11 > 4, a
# fatura vence no mesmo mês em que fecha.
UNICRED = [
    (date(2026, 9, 3), date(2026, 9, 1)),
    (date(2026, 9, 4), date(2026, 9, 1)),  # o dia do fechamento é inclusivo
    (date(2026, 9, 5), date(2026, 10, 1)),  # um dia depois, outra fatura
    (date(2026, 10, 4), date(2026, 10, 1)),
    (date(2026, 10, 5), date(2026, 11, 1)),
    (date(2026, 12, 5), date(2027, 1, 1)),  # vira o ano
]

# Nubank: fecha 27, vence 5. Como 5 < 27, a fatura vence no mês seguinte ao do
# fechamento — é por isso que o vencimento dele "pula" de mês.
NUBANK = [
    (date(2026, 9, 26), date(2026, 10, 1)),
    (date(2026, 9, 27), date(2026, 10, 1)),  # "o que gasto até 27/09, pago 5/10"
    (date(2026, 9, 28), date(2026, 11, 1)),  # "após o dia 28/09 ... pago 5/11"
    (date(2026, 10, 27), date(2026, 11, 1)),  # "... até o dia 27/10"
    (date(2026, 10, 28), date(2026, 12, 1)),
]


@pytest.mark.parametrize(("compra", "fatura"), UNICRED)
def test_unicred_fecha_04_vence_11(conn: Conexao, compra: date, fatura: date) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Unicred", fecha=4, vence=11)
        assert _fatura_de(cur, conta, compra) == fatura


@pytest.mark.parametrize(("compra", "fatura"), NUBANK)
def test_nubank_fecha_27_vence_05_do_mes_seguinte(
    conn: Conexao, compra: date, fatura: date
) -> None:
    """Vencimento anterior ao fechamento joga a fatura para o mês seguinte."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Nubank", fecha=27, vence=5)
        assert _fatura_de(cur, conta, compra) == fatura


def test_vencimento_no_mesmo_dia_do_fechamento(conn: Conexao) -> None:
    """Caso de borda: `due_day == closing_day` vence no mês seguinte.

    O vencimento vem sempre depois do fechamento — de 7 a 10 dias, na prática —
    então um vencimento no mesmo número de dia só pode ser o do mês seguinte.
    """
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Borda", fecha=10, vence=10)
        assert _fatura_de(cur, conta, date(2026, 3, 10)) == date(2026, 4, 1)
        assert _fatura_de(cur, conta, date(2026, 3, 11)) == date(2026, 5, 1)


# ------------------------------------------- pagamento não é compra


@pytest.fixture
def cartao_e_conta(conn: Conexao) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        cartao = _cartao(cur, user_id, "Unicred", fecha=4, vence=11)
        corrente = uuid.uuid4()
        cur.execute(
            "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, 'PicPay', 'checking')",
            (corrente, user_id),
        )
    return user_id, cartao, corrente


def test_pagamento_de_fatura_nao_recebe_mes_de_fatura(
    conn: Conexao, cartao_e_conta: tuple[uuid.UUID, uuid.UUID, uuid.UUID]
) -> None:
    """Antes do ADR-007 o pagamento de 11/10 era marcado como fatura de novembro."""
    user_id, cartao, corrente = cartao_e_conta
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO transactions"
            " (user_id, kind, account_id, amount, occurred_on, transfer_id)"
            " VALUES (%s, 'transfer', %s, %s, %s, %s)",
            [
                (user_id, corrente, Decimal("-500.00"), date(2026, 10, 11), transfer),
                (user_id, cartao, Decimal("500.00"), date(2026, 10, 11), transfer),
            ],
        )
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cur.execute(
            "SELECT count(*) FROM transactions WHERE transfer_id = %s"
            " AND invoice_month IS NOT NULL",
            (transfer,),
        )
        assert cur.fetchone() == (0,)


def test_informar_mes_de_fatura_numa_transferencia_e_recusado(
    conn: Conexao, cartao_e_conta: tuple[uuid.UUID, uuid.UUID, uuid.UUID]
) -> None:
    user_id, cartao, _ = cartao_e_conta
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, amount, occurred_on, transfer_id, invoice_month)"
                " VALUES (%s, 'transfer', %s, 500, %s, %s, %s)",
                (user_id, cartao, date(2026, 10, 11), uuid.uuid4(), date(2026, 10, 1)),
            )
        assert erro.value.sqlstate == "23F04"


def test_total_da_fatura_so_tem_compras(
    conn: Conexao, cartao_e_conta: tuple[uuid.UUID, uuid.UUID, uuid.UUID]
) -> None:
    """O sintoma que denunciou o problema: uma fatura com total positivo."""
    user_id, cartao, corrente = cartao_e_conta
    grupo, categoria = uuid.uuid4(), uuid.uuid4()
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, 'Essenciais')",
            (grupo, user_id),
        )
        cur.execute(
            "INSERT INTO categories (id, user_id, group_id, name, kind)"
            " VALUES (%s, %s, %s, 'Mercado', 'expense')",
            (categoria, user_id, grupo),
        )
        cur.execute(
            "INSERT INTO transactions"
            " (user_id, kind, account_id, category_id, amount, occurred_on)"
            " VALUES (%s, 'expense', %s, %s, %s, %s)",
            (user_id, cartao, categoria, Decimal("-500.00"), date(2026, 9, 15)),
        )
        cur.executemany(
            "INSERT INTO transactions"
            " (user_id, kind, account_id, amount, occurred_on, transfer_id)"
            " VALUES (%s, 'transfer', %s, %s, %s, %s)",
            [
                (user_id, corrente, Decimal("-500.00"), date(2026, 10, 11), transfer),
                (user_id, cartao, Decimal("500.00"), date(2026, 10, 11), transfer),
            ],
        )
        cur.execute("SET CONSTRAINTS ALL IMMEDIATE")

        cur.execute(
            "SELECT sum(amount) FROM transactions WHERE user_id = %s AND invoice_month = %s",
            (user_id, date(2026, 10, 1)),
        )
        assert cur.fetchone() == (Decimal("-500.00"),)

        # E o saldo do cartão continua somando tudo, pagamento incluído.
        cur.execute("SELECT sum(amount) FROM transactions WHERE account_id = %s", (cartao,))
        assert cur.fetchone() == (Decimal("0.00"),)
