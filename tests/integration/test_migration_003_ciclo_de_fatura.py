"""O ciclo da fatura, fixado pelos dois cartões reais (ADR-007).

Estes testes existem porque a palavra "fechamento" se mostrou ambígua: o dono
descreveu os próprios cartões por duas convenções diferentes na mesma frase.
Em vez de depender do nome da coluna, aqui estão as datas concretas que ele
informou, e elas passam a ser o contrato.
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


def _cartao(cur: Cursor, user_id: uuid.UUID, nome: str, inicio: int, vence: int) -> uuid.UUID:
    conta = uuid.uuid4()
    cur.execute(
        "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, %s, 'credit_card')",
        (conta, user_id, nome),
    )
    cur.execute(
        "INSERT INTO account_terms (user_id, account_id, vigencia, cycle_start_day, due_day)"
        " VALUES (%s, %s, '[2020-01-01,)', %s, %s)",
        (user_id, conta, inicio, vence),
    )
    return conta


def _fatura_de(cur: Cursor, conta: uuid.UUID, compra: date) -> date:
    cur.execute("SELECT invoice_month_for(%s, %s, NULL)", (conta, compra))
    linha = cur.fetchone()
    assert linha is not None
    valor = linha[0]
    assert isinstance(valor, date)
    return valor


# O Unicred é descrito como "fecha dia 04, vence dia 11", e o ciclo que o dono
# relata é 04/09 → 03/10, pago em 11/10. Logo, cycle_start_day = 4.
UNICRED = [
    (date(2026, 9, 3), date(2026, 9, 1)),  # último dia do ciclo anterior
    (date(2026, 9, 4), date(2026, 10, 1)),  # "gasto do dia 04/09 ... pago 11/10"
    (date(2026, 9, 15), date(2026, 10, 1)),
    (date(2026, 10, 3), date(2026, 10, 1)),  # "... até o dia 03/10"
    (date(2026, 10, 4), date(2026, 11, 1)),  # "gasto 04/10 a 03/11, pago 11/11"
]

# O Nubank é descrito como "fecha dia 27, vence dia 5", e o ciclo relatado é
# 28/09 → 27/10, pago em 05/11. Logo, cycle_start_day = 28 — e **não** 27, que
# é o número que o banco anuncia. É o custo consciente do ADR-007.
NUBANK = [
    (date(2026, 9, 27), date(2026, 10, 1)),  # "o que gasto até 27/09, pago 5/10"
    (date(2026, 9, 28), date(2026, 11, 1)),  # "após o dia 28/09 ... pago 5/11"
    (date(2026, 10, 15), date(2026, 11, 1)),
    (date(2026, 10, 27), date(2026, 11, 1)),  # "... até o dia 27/10"
    (date(2026, 10, 28), date(2026, 12, 1)),
]


@pytest.mark.parametrize(("compra", "fatura"), UNICRED)
def test_unicred_ciclo_04_vence_11(conn: Conexao, compra: date, fatura: date) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Unicred", inicio=4, vence=11)
        assert _fatura_de(cur, conta, compra) == fatura


@pytest.mark.parametrize(("compra", "fatura"), NUBANK)
def test_nubank_ciclo_28_vence_05_do_mes_seguinte(
    conn: Conexao, compra: date, fatura: date
) -> None:
    """Vencimento antes do início do ciclo joga a fatura para o mês seguinte."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Nubank", inicio=28, vence=5)
        assert _fatura_de(cur, conta, compra) == fatura


def test_vencimento_no_mesmo_dia_do_inicio_do_ciclo(conn: Conexao) -> None:
    """Caso de borda: `due_day == cycle_start_day` vence no mês em que o ciclo fecha.

    O ciclo que começa em 10/03 termina em 09/04, então o vencimento no dia 10
    cai logo depois, em 10/04 — e não um mês adiante.
    """
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        conta = _cartao(cur, user_id, "Borda", inicio=10, vence=10)
        assert _fatura_de(cur, conta, date(2026, 3, 10)) == date(2026, 4, 1)
        assert _fatura_de(cur, conta, date(2026, 3, 9)) == date(2026, 3, 1)


# ------------------------------------------- pagamento não é compra


@pytest.fixture
def cartao_e_conta(conn: Conexao) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        cartao = _cartao(cur, user_id, "Unicred", inicio=4, vence=11)
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
