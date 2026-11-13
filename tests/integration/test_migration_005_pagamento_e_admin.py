"""A migration 005: a perna de pagamento aponta a fatura que quita, e quem administra.

Dois invariantes novos, os dois verificados no banco e não só no Python, pelo
motivo do ADR-004: todo caminho de escrita — app, importador, seed — precisa
obedecer.

O que estes testes fixam é o **comportamento**, não o nome da coluna. O ADR-008
registrou o custo de testar o nome: os testes da migration 002 passaram enquanto
a coluna mudava de significado duas vezes, porque nenhum deles exercitava uma
perna de transferência numa conta de cartão — que é exatamente o pagamento.
"""

import uuid
from datetime import date
from decimal import Decimal

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app, define_usuario

pytestmark = pytest.mark.integration

Cursor = psycopg.Cursor[tuple[object, ...]]

# Códigos que a migration 005 levanta. Testar o código, e não a mensagem, é o
# que permite reescrever o texto do erro sem quebrar teste.
SO_TRANSFERENCIA_QUITA = "23F05"
SO_CARTAO_TEM_FATURA = "23F06"
QUITA_E_A_PERNA_DE_ENTRADA = "23F07"
SEM_PERMISSAO = "42501"


def _usuario(cur: Cursor, *, admin: bool = False, demo: bool = False) -> uuid.UUID:
    user_id = uuid.uuid4()
    cur.execute(
        "INSERT INTO app_users (id, email, display_name, is_admin, is_demo)"
        " VALUES (%s, %s, 'Teste', %s, %s)",
        (user_id, f"{user_id}@exemplo.com", admin, demo),
    )
    return user_id


def _conta(cur: Cursor, user_id: uuid.UUID, nome: str, kind: str) -> uuid.UUID:
    conta = uuid.uuid4()
    cur.execute(
        "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, %s, %s)",
        (conta, user_id, nome, kind),
    )
    if kind == "credit_card":
        # Unicred: fecha 4, vence 11 — os números do app do banco (ADR-008).
        cur.execute(
            "INSERT INTO account_terms (user_id, account_id, vigencia, closing_day, due_day)"
            " VALUES (%s, %s, '[2020-01-01,)', 4, 11)",
            (user_id, conta),
        )
    return conta


def _pagamento(
    cur: Cursor,
    user_id: uuid.UUID,
    conta: uuid.UUID,
    valor: Decimal,
    *,
    quita: date | None,
    quando: date = date(2026, 10, 11),
) -> None:
    """Uma perna de transferência, com ou sem a fatura que ela quita."""
    cur.execute(
        "INSERT INTO transactions"
        " (user_id, kind, account_id, amount, occurred_on, transfer_id, settles_invoice_month)"
        " VALUES (%s, 'transfer', %s, %s, %s, %s, %s)",
        (user_id, conta, valor, quando, uuid.uuid4(), quita),
    )


def _categoria(cur: Cursor, user_id: uuid.UUID) -> uuid.UUID:
    """Despesa precisa de categoria; transferência não pode ter (migration 002)."""
    grupo, categoria = uuid.uuid4(), uuid.uuid4()
    cur.execute(
        "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, 'Essenciais')",
        (grupo, user_id),
    )
    cur.execute(
        "INSERT INTO categories (id, user_id, group_id, name, kind)"
        " VALUES (%s, %s, %s, 'Mercado', 'expense')",
        (categoria, user_id, grupo),
    )
    return categoria


def _compra(
    cur: Cursor,
    user_id: uuid.UUID,
    conta: uuid.UUID,
    valor: Decimal,
    quando: date,
    categoria: uuid.UUID,
) -> None:
    cur.execute(
        "INSERT INTO transactions"
        " (user_id, kind, account_id, category_id, amount, occurred_on)"
        " VALUES (%s, 'expense', %s, %s, %s, %s)",
        (user_id, conta, categoria, -valor, quando),
    )


# ------------------------------------------------- 1. settles_invoice_month (ADR-010)


def test_pagamento_guarda_a_fatura_que_quita(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        _pagamento(cur, user_id, cartao, Decimal("1284.90"), quita=date(2026, 10, 1))

        cur.execute(
            "SELECT settles_invoice_month, invoice_month FROM transactions WHERE account_id = %s",
            (cartao,),
        )
        linha = cur.fetchone()
        assert linha is not None
        quita, compra = linha
        assert quita == date(2026, 10, 1)
        # A outra metade do ADR-007 continua valendo: pagamento não é compra.
        assert compra is None


def test_despesa_nao_pode_quitar_fatura(conn: Conexao) -> None:
    """Quem quita é transferência. Despesa que aponta fatura é erro de quem escreveu."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        categoria = _categoria(cur, user_id)

        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on,"
                "  settles_invoice_month)"
                " VALUES (%s, 'expense', %s, %s, -50, '2026-10-06', '2026-10-01')",
                (user_id, cartao, categoria),
            )
        assert erro.value.sqlstate == SO_TRANSFERENCIA_QUITA


def test_conta_corrente_nao_tem_fatura_a_quitar(conn: Conexao) -> None:
    """A perna que sai da conta corrente paga, mas não é ela que quita a fatura."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        corrente = _conta(cur, user_id, "PicPay", "checking")

        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _pagamento(cur, user_id, corrente, Decimal("-1284.90"), quita=date(2026, 10, 1))
        assert erro.value.sqlstate == SO_CARTAO_TEM_FATURA


def test_quem_quita_e_a_perna_de_entrada_no_cartao(conn: Conexao) -> None:
    """Na conta do cartão a compra é negativa; quem reduz a dívida é o valor positivo."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _pagamento(cur, user_id, cartao, Decimal("-1284.90"), quita=date(2026, 10, 1))
        assert erro.value.sqlstate == QUITA_E_A_PERNA_DE_ENTRADA


def test_estorno_e_perna_sem_fatura_apontada(conn: Conexao) -> None:
    """A coluna é anulável de propósito: crédito no cartão sem fatura é estorno."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        _pagamento(cur, user_id, cartao, Decimal("37.40"), quita=None)

        cur.execute(
            "SELECT count(*) FROM transactions"
            " WHERE account_id = %s AND settles_invoice_month IS NULL",
            (cartao,),
        )
        assert cur.fetchone() == (1,)


def test_fatura_quitada_precisa_ser_primeiro_dia_do_mes(conn: Conexao) -> None:
    """Mesma convenção de invoice_month, para que as duas colunas sejam comparáveis."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        with pytest.raises(psycopg.errors.CheckViolation):
            _pagamento(cur, user_id, cartao, Decimal("10.00"), quita=date(2026, 10, 11))


def test_update_que_so_mexe_na_coluna_tambem_e_vigiado(conn: Conexao) -> None:
    """Sem `settles_invoice_month` na lista do trigger, este UPDATE passaria batido."""
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")
        categoria = _categoria(cur, user_id)
        _compra(cur, user_id, cartao, Decimal("50.00"), date(2026, 10, 3), categoria)

        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "UPDATE transactions SET settles_invoice_month = '2026-10-01'"
                " WHERE account_id = %s",
                (cartao,),
            )
        assert erro.value.sqlstate == SO_TRANSFERENCIA_QUITA


def test_situacao_da_fatura_sai_de_duas_somas(conn: Conexao) -> None:
    """O ponto do ADR-010: aberta, parcial e paga viram comparação exata, não heurística.

    O caso montado abaixo é o que a heurística por janela de datas erra: dois
    pagamentos parciais, um deles com atraso, numa fatura só.
    """
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        define_usuario(cur, user_id)
        cartao = _conta(cur, user_id, "Unicred", "credit_card")

        categoria = _categoria(cur, user_id)

        # Duas compras na fatura que vence em 11/10/2026.
        _compra(cur, user_id, cartao, Decimal("800.00"), date(2026, 10, 2), categoria)
        _compra(cur, user_id, cartao, Decimal("484.90"), date(2026, 10, 4), categoria)

        # Pago em duas vezes, a segunda com atraso de uma semana.
        _pagamento(cur, user_id, cartao, Decimal("600.00"), quita=date(2026, 10, 1))
        _pagamento(
            cur,
            user_id,
            cartao,
            Decimal("684.90"),
            quita=date(2026, 10, 1),
            quando=date(2026, 10, 18),
        )

        cur.execute(
            "SELECT"
            " -coalesce(sum(amount) FILTER (WHERE invoice_month = %s), 0),"
            " coalesce(sum(amount) FILTER (WHERE settles_invoice_month = %s), 0)"
            " FROM transactions WHERE account_id = %s",
            (date(2026, 10, 1), date(2026, 10, 1), cartao),
        )
        linha = cur.fetchone()
        assert linha is not None
        total, pago = linha
        assert total == Decimal("1284.90")
        assert pago == Decimal("1284.90")
        # fetchone() devolve tupla de `object` para o mypy; o valor é Decimal (acima).
        assert isinstance(total, Decimal) and isinstance(pago, Decimal)
        assert total - pago == 0  # paga


# ------------------------------------------------------------- 2. is_admin (RF19)


def test_demo_nao_pode_administrar(conn: Conexao) -> None:
    """O demo é compartilhado por qualquer visitante (ADR-003); dar-lhe a allowlist, não."""
    with conn.cursor() as cur, pytest.raises(psycopg.errors.CheckViolation):
        _usuario(cur, admin=True, demo=True)


def test_admin_lista_a_allowlist_inteira(conn: Conexao) -> None:
    with conn.cursor() as cur:
        admin = _usuario(cur, admin=True)
        _usuario(cur)
        _usuario(cur)
        conn.commit()  # a função roda como `owner` e precisa ver as linhas

        como_app(cur, admin)
        cur.execute("SELECT count(*) FROM admin_list_app_users()")
        linha = cur.fetchone()
        assert linha is not None
        assert isinstance(linha[0], int)
        assert linha[0] >= 3


def test_quem_nao_administra_nao_lista(conn: Conexao) -> None:
    """Esconder a página não protege nada: a regra tem de valer no banco."""
    with conn.cursor() as cur:
        comum = _usuario(cur)
        conn.commit()

        como_app(cur, comum)
        with pytest.raises(psycopg.errors.InsufficientPrivilege) as erro:
            cur.execute("SELECT * FROM admin_list_app_users()")
        assert erro.value.sqlstate == SEM_PERMISSAO


def test_a_rls_continua_escondendo_as_outras_linhas(conn: Conexao) -> None:
    """A função é a exceção; o SELECT direto continua vendo só a própria linha."""
    with conn.cursor() as cur:
        admin = _usuario(cur, admin=True)
        _usuario(cur)
        conn.commit()

        como_app(cur, admin)
        cur.execute("SELECT count(*) FROM app_users")
        assert cur.fetchone() == (1,)
