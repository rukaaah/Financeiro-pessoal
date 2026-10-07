"""Os invariantes da migration 002 são de verdade?

Dois deles são o coração do sistema e vivem no banco de propósito (ADR-001):
a transferência que soma zero e o mês da fatura do ADR-005. Estes testes os
atacam pelos caminhos que a aplicação usaria.
"""

import uuid
from datetime import date
from decimal import Decimal

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app

pytestmark = pytest.mark.integration

Cursor = psycopg.Cursor[tuple[object, ...]]
Cenario = dict[str, uuid.UUID]


def _cria_usuario(cur: Cursor) -> uuid.UUID:
    """Usuário novo a cada chamada.

    Ids e e-mails são gerados, nunca constantes: assim um resíduo de execução
    anterior no banco não derruba a suíte, e dois usuários num mesmo teste
    nunca colidem.
    """
    user_id = uuid.uuid4()
    cur.execute(
        "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, %s)",
        (user_id, f"{user_id}@exemplo.com", "Usuária de teste"),
    )
    return user_id


@pytest.fixture
def cenario(conn: Conexao) -> Cenario:
    """Um usuário com conta corrente, cartão Unicred e uma categoria.

    Unicred: fecha dia 23, vence dia 30 — os números reais do CLAUDE.md.
    """
    ids: Cenario = {
        "corrente": uuid.uuid4(),
        "cartao": uuid.uuid4(),
        "grupo": uuid.uuid4(),
        "categoria": uuid.uuid4(),
    }
    with conn.cursor() as cur:
        usuario = _cria_usuario(cur)
        ids["usuario"] = usuario
        cur.executemany(
            "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, %s, %s)",
            [
                (ids["corrente"], usuario, "PicPay", "checking"),
                (ids["cartao"], usuario, "Unicred", "credit_card"),
            ],
        )
        cur.execute(
            "INSERT INTO account_terms (user_id, account_id, vigencia, cycle_start_day, due_day)"
            " VALUES (%s, %s, %s, 4, 11)",
            (usuario, ids["cartao"], "[2020-01-01,)"),
        )
        cur.execute(
            "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, %s)",
            (ids["grupo"], usuario, "Essenciais"),
        )
        cur.execute(
            "INSERT INTO categories (id, user_id, group_id, name, kind)"
            " VALUES (%s, %s, %s, %s, 'expense')",
            (ids["categoria"], usuario, ids["grupo"], "Mercado"),
        )
    return ids


def _gasto_no_cartao(
    cur: Cursor,
    cenario: Cenario,
    quando: date,
    parcela: tuple[int, int] | None = None,
) -> None:
    grupo = uuid.uuid4() if parcela else None
    numero, total = parcela if parcela else (None, None)
    cur.execute(
        "INSERT INTO transactions"
        " (user_id, kind, account_id, category_id, amount, occurred_on,"
        "  installment_no, installment_total, installment_group_id)"
        " VALUES (%s, 'expense', %s, %s, %s, %s, %s, %s, %s)",
        (
            cenario["usuario"],
            cenario["cartao"],
            cenario["categoria"],
            Decimal("-100.00"),
            quando,
            numero,
            total,
            grupo,
        ),
    )


# --------------------------------------------------------------- ADR-005


@pytest.mark.parametrize(
    ("compra", "fatura"),
    [
        # Ciclo do Unicred: começa dia 4, termina dia 3 do mês seguinte,
        # vence dia 11 do mês em que termina (ADR-007).
        (date(2026, 3, 1), date(2026, 3, 1)),
        (date(2026, 3, 3), date(2026, 3, 1)),  # último dia do ciclo
        (date(2026, 3, 4), date(2026, 4, 1)),  # primeiro dia do ciclo novo
        (date(2026, 3, 22), date(2026, 4, 1)),
        (date(2026, 4, 3), date(2026, 4, 1)),  # fecha o mesmo ciclo do dia 4/3
        (date(2026, 12, 28), date(2027, 1, 1)),  # vira o ano
    ],
)
def test_mes_da_fatura_segue_o_inicio_do_ciclo(
    conn: Conexao, cenario: Cenario, compra: date, fatura: date
) -> None:
    """Antes do início do ciclo vai para a fatura deste mês; a partir dele, a seguinte."""
    with conn.cursor() as cur:
        _gasto_no_cartao(cur, cenario, compra)
        cur.execute(
            "SELECT invoice_month FROM transactions WHERE user_id = %s AND occurred_on = %s",
            (cenario["usuario"], compra),
        )
        assert cur.fetchone() == (fatura,)


def test_cada_parcela_cai_na_fatura_em_que_vence(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        for numero in (1, 2, 3):
            _gasto_no_cartao(cur, cenario, date(2026, 3, 10), parcela=(numero, 3))
        cur.execute(
            "SELECT installment_no, invoice_month FROM transactions"
            " WHERE user_id = %s AND installment_no IS NOT NULL ORDER BY installment_no",
            (cenario["usuario"],),
        )
        assert cur.fetchall() == [
            (1, date(2026, 4, 1)),
            (2, date(2026, 5, 1)),
            (3, date(2026, 6, 1)),
        ]


def test_invoice_month_divergente_e_recusado(conn: Conexao, cenario: Cenario) -> None:
    """O mês da fatura é invariante, não campo editável (ADR-005)."""
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on, invoice_month)"
                " VALUES (%s, 'expense', %s, %s, -10, %s, %s)",
                (
                    cenario["usuario"],
                    cenario["cartao"],
                    cenario["categoria"],
                    date(2026, 3, 10),
                    date(2026, 7, 1),
                ),
            )
        assert erro.value.sqlstate == "23F02"


def test_conta_sem_fatura_nao_aceita_invoice_month(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on, invoice_month)"
                " VALUES (%s, 'expense', %s, %s, -10, %s, %s)",
                (
                    cenario["usuario"],
                    cenario["corrente"],
                    cenario["categoria"],
                    date(2026, 3, 10),
                    date(2026, 3, 1),
                ),
            )
        assert erro.value.sqlstate == "23F03"


def test_compra_sem_vigencia_de_termos_falha_alto(conn: Conexao, cenario: Cenario) -> None:
    """Período de vigência faltando é erro de dado, e precisa falhar (ADR-005)."""
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _gasto_no_cartao(cur, cenario, date(2019, 5, 10))
        assert erro.value.sqlstate == "23F01"


def test_vigencias_do_mesmo_cartao_nao_se_sobrepoem(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur, pytest.raises(psycopg.errors.ExclusionViolation):
        cur.execute(
            "INSERT INTO account_terms"
            " (user_id, account_id, vigencia, cycle_start_day, due_day)"
            " VALUES (%s, %s, '[2025-01-01,2027-01-01)', 10, 20)",
            (cenario["usuario"], cenario["cartao"]),
        )


def test_mudanca_de_vigencia_preserva_o_calculo_historico(conn: Conexao, cenario: Cenario) -> None:
    """Trocar o fechamento não recalcula o passado com a regra nova."""
    with conn.cursor() as cur:
        # Fecha a vigência atual e abre outra, com fechamento no dia 5.
        cur.execute(
            "UPDATE account_terms SET vigencia = '[2020-01-01,2026-06-01)' WHERE account_id = %s",
            (cenario["cartao"],),
        )
        cur.execute(
            "INSERT INTO account_terms"
            " (user_id, account_id, vigencia, cycle_start_day, due_day)"
            " VALUES (%s, %s, '[2026-06-01,)', 20, 27)",
            (cenario["usuario"], cenario["cartao"]),
        )
        _gasto_no_cartao(cur, cenario, date(2026, 3, 10))  # vigência antiga: ciclo 4
        _gasto_no_cartao(cur, cenario, date(2026, 6, 10))  # vigência nova: ciclo 20
        cur.execute(
            "SELECT occurred_on, invoice_month FROM transactions"
            " WHERE user_id = %s ORDER BY occurred_on",
            (cenario["usuario"],),
        )
        assert cur.fetchall() == [
            (date(2026, 3, 10), date(2026, 4, 1)),  # dia 10 >= 4: fatura de abril
            (date(2026, 6, 10), date(2026, 6, 1)),  # dia 10 < 20: fatura de junho
        ]


# ------------------------------------------------- transferência soma zero


def _perna(
    cur: Cursor,
    cenario: Cenario,
    conta: uuid.UUID,
    valor: str,
    transfer_id: uuid.UUID,
) -> None:
    cur.execute(
        "INSERT INTO transactions (user_id, kind, account_id, amount, occurred_on, transfer_id)"
        " VALUES (%s, 'transfer', %s, %s, %s, %s)",
        (cenario["usuario"], conta, Decimal(valor), date(2026, 3, 30), transfer_id),
    )


def _checa_agora(cur: Cursor) -> None:
    """Força a verificação do trigger deferido sem commitar.

    O trigger de soma zero é DEFERRABLE INITIALLY DEFERRED, então normalmente só
    dispara no COMMIT. Commitar aqui destruiria o isolamento por rollback dos
    testes; `SET CONSTRAINTS ALL IMMEDIATE` dispara a verificação no ponto exato
    em que quisermos, dentro da transação.
    """
    cur.execute("SET CONSTRAINTS ALL IMMEDIATE")


def test_transferencia_com_duas_pernas_opostas_e_aceita(conn: Conexao, cenario: Cenario) -> None:
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-500.00", transfer)
        _perna(cur, cenario, cenario["cartao"], "500.00", transfer)
        _checa_agora(cur)
        cur.execute("SELECT sum(amount) FROM transactions WHERE transfer_id = %s", (transfer,))
        assert cur.fetchone() == (Decimal("0.00"),)


def test_perna_solitaria_passa_no_insert_mas_falha_na_verificacao(
    conn: Conexao, cenario: Cenario
) -> None:
    """O trigger é DEFERRABLE: as duas pernas entram em comandos separados."""
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-100.00", uuid.uuid4())  # o INSERT passa
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _checa_agora(cur)
    assert erro.value.sqlstate == "23F10"


def test_pernas_que_nao_somam_zero_sao_recusadas(conn: Conexao, cenario: Cenario) -> None:
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-100.00", transfer)
        _perna(cur, cenario, cenario["cartao"], "90.00", transfer)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _checa_agora(cur)
    assert erro.value.sqlstate == "23F11"


def test_transferencia_para_a_mesma_conta_e_recusada(conn: Conexao, cenario: Cenario) -> None:
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-100.00", transfer)
        _perna(cur, cenario, cenario["corrente"], "100.00", transfer)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _checa_agora(cur)
    assert erro.value.sqlstate == "23F12"


def test_apagar_so_uma_perna_e_recusado(conn: Conexao, cenario: Cenario) -> None:
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-500.00", transfer)
        _perna(cur, cenario, cenario["cartao"], "500.00", transfer)
        _checa_agora(cur)
        # As restrições ficaram imediatas, então o DELETE já falha aqui.
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "DELETE FROM transactions WHERE transfer_id = %s AND amount < 0", (transfer,)
            )
    assert erro.value.sqlstate == "23F10"


def test_apagar_as_duas_pernas_juntas_e_permitido(conn: Conexao, cenario: Cenario) -> None:
    transfer = uuid.uuid4()
    with conn.cursor() as cur:
        _perna(cur, cenario, cenario["corrente"], "-500.00", transfer)
        _perna(cur, cenario, cenario["cartao"], "500.00", transfer)
        _checa_agora(cur)
        cur.execute("DELETE FROM transactions WHERE transfer_id = %s", (transfer,))
        cur.execute("SELECT count(*) FROM transactions WHERE transfer_id = %s", (transfer,))
        assert cur.fetchone() == (0,)


# ------------------------------------------------------------ coerência


def test_despesa_precisa_de_valor_negativo(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.CheckViolation) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on)"
                " VALUES (%s, 'expense', %s, %s, 100, %s)",
                (
                    cenario["usuario"],
                    cenario["corrente"],
                    cenario["categoria"],
                    date(2026, 3, 10),
                ),
            )
        assert "transactions_sinal_casa_com_tipo" in str(erro.value)


def test_transferencia_nao_tem_categoria(conn: Conexao, cenario: Cenario) -> None:
    """Pagar por alguém é transferência, não gasto (RF17)."""
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.CheckViolation) as erro:
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on, transfer_id)"
                " VALUES (%s, 'transfer', %s, %s, -10, %s, %s)",
                (
                    cenario["usuario"],
                    cenario["corrente"],
                    cenario["categoria"],
                    date(2026, 3, 10),
                    uuid.uuid4(),
                ),
            )
        assert "transactions_categoria_exceto_transferencia" in str(erro.value)


def test_conta_a_receber_exige_contraparte(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.CheckViolation) as erro:
            cur.execute(
                "INSERT INTO accounts (user_id, name, kind) VALUES (%s, %s, 'receivable')",
                (cenario["usuario"], "A receber"),
            )
        assert "accounts_contraparte_so_em_receivable" in str(erro.value)


def test_conta_comum_nao_pode_ter_contraparte(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        pessoa = uuid.uuid4()
        cur.execute(
            "INSERT INTO counterparties (id, user_id, name) VALUES (%s, %s, %s)",
            (pessoa, cenario["usuario"], "Fulana"),
        )
        with pytest.raises(psycopg.errors.CheckViolation):
            cur.execute(
                "INSERT INTO accounts (user_id, name, kind, counterparty_id)"
                " VALUES (%s, %s, 'checking', %s)",
                (cenario["usuario"], "Outra", pessoa),
            )


def test_nao_se_aponta_para_contraparte_de_outro_usuario(conn: Conexao, cenario: Cenario) -> None:
    """A FK composta inclui user_id justamente para fechar este canal."""
    with conn.cursor() as cur:
        outro = _cria_usuario(cur)
        pessoa_do_outro = uuid.uuid4()
        cur.execute(
            "INSERT INTO counterparties (id, user_id, name) VALUES (%s, %s, %s)",
            (pessoa_do_outro, outro, "Pessoa alheia"),
        )
        with pytest.raises(psycopg.errors.ForeignKeyViolation):
            cur.execute(
                "INSERT INTO accounts (user_id, name, kind, counterparty_id)"
                " VALUES (%s, %s, 'receivable', %s)",
                (cenario["usuario"], "A receber", pessoa_do_outro),
            )


# ------------------------------------------------------------------ RLS


@pytest.mark.parametrize(
    "tabela",
    [
        "counterparties",
        "accounts",
        "account_terms",
        "category_groups",
        "categories",
        "transactions",
    ],
)
def test_rls_habilitada_em_todas_as_tabelas(conn: Conexao, tabela: str) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT relrowsecurity FROM pg_class WHERE relname = %s", (tabela,))
        assert cur.fetchone() == (True,), f"{tabela} está sem RLS"


def test_app_de_outro_usuario_nao_ve_lancamentos(conn: Conexao, cenario: Cenario) -> None:
    with conn.cursor() as cur:
        _gasto_no_cartao(cur, cenario, date(2026, 3, 10))
        intrusa = _cria_usuario(cur)
        como_app(cur, intrusa)
        cur.execute("SELECT count(*) FROM transactions")
        assert cur.fetchone() == (0,)


def test_app_nao_cria_lancamento_no_nome_de_outro(conn: Conexao, cenario: Cenario) -> None:
    """É o WITH CHECK da policy que impede isto."""
    with conn.cursor() as cur:
        intrusa = _cria_usuario(cur)
        como_app(cur, intrusa)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "INSERT INTO transactions"
                " (user_id, kind, account_id, category_id, amount, occurred_on)"
                " VALUES (%s, 'expense', %s, %s, -10, %s)",
                (
                    cenario["usuario"],
                    cenario["corrente"],
                    cenario["categoria"],
                    date(2026, 3, 10),
                ),
            )
