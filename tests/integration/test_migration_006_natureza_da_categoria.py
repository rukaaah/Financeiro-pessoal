"""A migration 006: natureza da categoria e a categoria com cofrinho (ADR-014).

O que estes testes fixam é a regra que o Resumo usa: de onde saiu o dinheiro de
um gasto de categoria com cofrinho. Os invariantes vivem no banco pelo motivo do
ADR-004 — app, importador e seed precisam obedecer igual.

Os gatilhos de custeio são diferidos (a despesa e as duas pernas do resgate
entram em comandos separados), então cada teste fecha com
`SET CONSTRAINTS ALL IMMEDIATE`, que dispara agora o que só dispararia no commit.
"""

import uuid
from datetime import date
from decimal import Decimal

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app, define_usuario

pytestmark = pytest.mark.integration

Cursor = psycopg.Cursor[tuple[object, ...]]

# Códigos da migration 006. Testar o código, e não a mensagem, deixa reescrever
# o texto do erro sem quebrar teste.
NAO_E_COFRINHO = "23F20"
SO_SAIDA_DE_COFRINHO_APONTA = "23F21"
NAO_E_DESTE_COFRINHO = "23F22"
RESGATE_MAIOR_QUE_DESPESA = "23F23"
CATEGORIA_PRESA_AO_COFRINHO = "23F24"
VIOLA_CHECK = "23514"
VIOLA_UNIQUE = "23505"
# ON DELETE RESTRICT levanta restrict_violation (23001), não o 23503 genérico de
# FK: o RESTRICT é checado na hora, sem esperar o fim do comando.
VIOLA_RESTRICT = "23001"
VIOLA_EXCLUSAO = "23P01"


def _usuario(cur: Cursor) -> uuid.UUID:
    user_id = uuid.uuid4()
    cur.execute(
        "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, 'Teste')",
        (user_id, f"{user_id}@exemplo.com"),
    )
    define_usuario(cur, user_id)
    return user_id


def _conta(cur: Cursor, user_id: uuid.UUID, nome: str, kind: str) -> uuid.UUID:
    conta = uuid.uuid4()
    cur.execute(
        "INSERT INTO accounts (id, user_id, name, kind) VALUES (%s, %s, %s, %s)",
        (conta, user_id, nome, kind),
    )
    return conta


def _categoria(
    cur: Cursor,
    user_id: uuid.UUID,
    nome: str,
    *,
    natureza: str = "variable",
    cofrinho: uuid.UUID | None = None,
    kind: str = "expense",
) -> uuid.UUID:
    grupo, categoria = uuid.uuid4(), uuid.uuid4()
    cur.execute(
        "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, %s)",
        (grupo, user_id, f"Grupo {categoria}"),
    )
    cur.execute(
        "INSERT INTO categories (id, user_id, group_id, name, kind, nature, goal_account_id)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (categoria, user_id, grupo, nome, kind, natureza, cofrinho),
    )
    return categoria


def _despesa(
    cur: Cursor, user_id: uuid.UUID, conta: uuid.UUID, categoria: uuid.UUID, valor: Decimal
) -> uuid.UUID:
    despesa = uuid.uuid4()
    cur.execute(
        "INSERT INTO transactions (id, user_id, kind, account_id, category_id, amount, occurred_on)"
        " VALUES (%s, %s, 'expense', %s, %s, %s, '2026-10-10')",
        (despesa, user_id, conta, categoria, -valor),
    )
    return despesa


def _transferencia(
    cur: Cursor,
    user_id: uuid.UUID,
    de: uuid.UUID,
    para: uuid.UUID,
    valor: Decimal,
    *,
    paga: uuid.UUID | None = None,
    aponta_na_entrada: bool = False,
) -> None:
    """Duas pernas. `paga` vai na perna de saída, ou na de entrada se pedido."""
    transfer = uuid.uuid4()
    sai, entra = (None, paga) if aponta_na_entrada else (paga, None)
    cur.execute(
        "INSERT INTO transactions"
        " (user_id, kind, account_id, amount, occurred_on, transfer_id, funds_expense_id)"
        " VALUES (%s, 'transfer', %s, %s, '2026-10-10', %s, %s),"
        "        (%s, 'transfer', %s, %s, '2026-10-10', %s, %s)",
        (user_id, de, -valor, transfer, sai, user_id, para, valor, transfer, entra),
    )


def _fecha(cur: Cursor) -> None:
    """Dispara agora os gatilhos diferidos, como o commit faria."""
    cur.execute("SET CONSTRAINTS ALL IMMEDIATE")


def _jogos(cur: Cursor) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """O caso do Pedro: categoria Jogos ligada ao cofrinho Jogos."""
    user_id = _usuario(cur)
    corrente = _conta(cur, user_id, "Inter", "checking")
    cofrinho = _conta(cur, user_id, "Cofrinho Jogos", "goal")
    jogos = _categoria(cur, user_id, "Jogos", natureza="goal_backed", cofrinho=cofrinho)
    return user_id, corrente, cofrinho, jogos


# ------------------------------------------------------- natureza da categoria


def test_categoria_existente_nasce_variavel(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        grupo = uuid.uuid4()
        cur.execute(
            "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, 'Casa')",
            (grupo, user_id),
        )
        cur.execute(
            "INSERT INTO categories (user_id, group_id, name, kind)"
            " VALUES (%s, %s, 'Mercado', 'expense') RETURNING nature",
            (user_id, grupo),
        )
        linha = cur.fetchone()
        assert linha is not None
        assert linha[0] == "variable"


def test_cofrinho_so_em_categoria_com_cofrinho(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _categoria(cur, user_id, "Jogos", natureza="goal_backed")
        assert erro.value.sqlstate == VIOLA_CHECK


def test_receita_nao_tem_natureza(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _categoria(cur, user_id, "Salário", natureza="fixed", kind="income")
        assert erro.value.sqlstate == VIOLA_CHECK


def test_cofrinho_da_categoria_e_conta_goal(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id = _usuario(cur)
        corrente = _conta(cur, user_id, "Inter", "checking")
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _categoria(cur, user_id, "Jogos", natureza="goal_backed", cofrinho=corrente)
        assert erro.value.sqlstate == NAO_E_COFRINHO


def test_um_cofrinho_atende_uma_categoria(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, _, cofrinho, _ = _jogos(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _categoria(cur, user_id, "Consoles", natureza="goal_backed", cofrinho=cofrinho)
        assert erro.value.sqlstate == VIOLA_UNIQUE


def test_cofrinho_em_uso_nao_muda_de_tipo(conn: Conexao) -> None:
    with conn.cursor() as cur:
        _, _, cofrinho, _ = _jogos(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute("UPDATE accounts SET kind = 'checking' WHERE id = %s", (cofrinho,))
        assert erro.value.sqlstate == NAO_E_COFRINHO


# ------------------------------------------------- inserção mensal prevista


def test_insercao_prevista_tem_vigencia(conn: Conexao) -> None:
    """Subir de 150 para 200 em novembro não reescreve outubro (ADR-014)."""
    with conn.cursor() as cur:
        user_id, _, cofrinho, _ = _jogos(cur)
        cur.execute(
            "INSERT INTO goal_contributions (user_id, account_id, vigencia, amount) VALUES"
            " (%s, %s, '[2026-01-01,2026-11-01)', 150), (%s, %s, '[2026-11-01,)', 200)",
            (user_id, cofrinho, user_id, cofrinho),
        )
        cur.execute(
            "SELECT amount FROM goal_contributions WHERE account_id = %s AND vigencia @> %s",
            (cofrinho, date(2026, 10, 15)),
        )
        linha = cur.fetchone()
        assert linha is not None
        assert linha[0] == Decimal("150.00")


def test_vigencias_nao_se_sobrepoem(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, _, cofrinho, _ = _jogos(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO goal_contributions (user_id, account_id, vigencia, amount) VALUES"
                " (%s, %s, '[2026-01-01,)', 150), (%s, %s, '[2026-06-01,)', 200)",
                (user_id, cofrinho, user_id, cofrinho),
            )
        assert erro.value.sqlstate == VIOLA_EXCLUSAO


def test_insercao_prevista_so_em_cofrinho(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, _, _ = _jogos(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute(
                "INSERT INTO goal_contributions (user_id, account_id, vigencia, amount)"
                " VALUES (%s, %s, '[2026-01-01,)', 150)",
                (user_id, corrente),
            )
        assert erro.value.sqlstate == NAO_E_COFRINHO


# ----------------------------------------------------- as três modalidades


def test_as_tres_modalidades_saem_de_somas(conn: Conexao) -> None:
    """Para o cofrinho, do cofrinho e do salário, sem heurística (ADR-014, regra 4).

    Outubro: põe 150 no cofrinho (o previsto), compra um jogo de 200 pagando
    150 com o cofrinho. Sobram 50 do salário: a categoria aparece no Resumo.
    """
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        _transferencia(cur, user_id, corrente, cofrinho, Decimal("150"))
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("150"), paga=jogo)
        _fecha(cur)

        cur.execute(
            "SELECT"
            "  (SELECT -sum(amount) FROM transactions WHERE category_id = %(cat)s),"
            "  (SELECT -sum(r.amount) FROM transactions r"
            "     JOIN transactions d ON d.id = r.funds_expense_id"
            "    WHERE d.category_id = %(cat)s),"
            "  (SELECT sum(amount) FROM transactions"
            "    WHERE account_id = %(cof)s AND amount > 0),"
            "  (SELECT sum(amount) FROM transactions WHERE account_id = %(cof)s)",
            {"cat": jogos, "cof": cofrinho},
        )
        linha = cur.fetchone()
        assert linha is not None
        gasto, do_cofrinho, para, saldo = linha
        assert isinstance(gasto, Decimal)
        assert isinstance(do_cofrinho, Decimal)
        assert (gasto, do_cofrinho, para) == (Decimal("200"), Decimal("150"), Decimal("150"))
        assert gasto - do_cofrinho == Decimal("50")  # do salário
        assert saldo == Decimal("0")  # o cofrinho pagou o que recebeu


def test_resgate_nao_paga_mais_que_a_despesa(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("250"), paga=jogo)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _fecha(cur)
        assert erro.value.sqlstate == RESGATE_MAIOR_QUE_DESPESA


def test_baixar_a_despesa_abaixo_do_resgate_falha(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("150"), paga=jogo)
        # Depois de `_fecha`, os gatilhos ficam imediatos até o fim da transação:
        # a falha vem no próprio UPDATE, não num commit posterior.
        _fecha(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute("UPDATE transactions SET amount = -100 WHERE id = %s", (jogo,))
        assert erro.value.sqlstate == RESGATE_MAIOR_QUE_DESPESA


def test_resgate_de_outro_cofrinho_nao_paga(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, _, jogos = _jogos(cur)
        viagem = _conta(cur, user_id, "Viagem", "goal")
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, viagem, corrente, Decimal("50"), paga=jogo)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _fecha(cur)
        assert erro.value.sqlstate == NAO_E_DESTE_COFRINHO


def test_cofrinho_nao_paga_categoria_variavel(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, _ = _jogos(cur)
        lanche = _categoria(cur, user_id, "Lanche")
        gasto = _despesa(cur, user_id, corrente, lanche, Decimal("30"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("10"), paga=gasto)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _fecha(cur)
        assert erro.value.sqlstate == NAO_E_DESTE_COFRINHO


def test_so_a_perna_de_saida_aponta_despesa(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(
            cur, user_id, corrente, cofrinho, Decimal("50"), paga=jogo, aponta_na_entrada=True
        )
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            _fecha(cur)
        assert erro.value.sqlstate == SO_SAIDA_DE_COFRINHO_APONTA


def test_categoria_presa_ao_cofrinho_que_pagou(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        viagem = _conta(cur, user_id, "Viagem", "goal")
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("150"), paga=jogo)
        _fecha(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute("UPDATE categories SET goal_account_id = %s WHERE id = %s", (viagem, jogos))
        assert erro.value.sqlstate == CATEGORIA_PRESA_AO_COFRINHO


def test_apagar_despesa_paga_pelo_cofrinho_exige_apagar_o_resgate(conn: Conexao) -> None:
    with conn.cursor() as cur:
        user_id, corrente, cofrinho, jogos = _jogos(cur)
        jogo = _despesa(cur, user_id, corrente, jogos, Decimal("200"))
        _transferencia(cur, user_id, cofrinho, corrente, Decimal("150"), paga=jogo)
        _fecha(cur)
        with pytest.raises(psycopg.errors.IntegrityError) as erro:
            cur.execute("DELETE FROM transactions WHERE id = %s", (jogo,))
        assert erro.value.sqlstate == VIOLA_RESTRICT


# ------------------------------------------------------------------- RLS


def test_insercao_prevista_e_isolada_por_usuario(conn: Conexao) -> None:
    with conn.cursor() as cur:
        dono, _, cofrinho, _ = _jogos(cur)
        cur.execute(
            "INSERT INTO goal_contributions (user_id, account_id, vigencia, amount)"
            " VALUES (%s, %s, '[2026-01-01,)', 150)",
            (dono, cofrinho),
        )
        outro = _usuario(cur)

        como_app(cur, outro)
        cur.execute("SELECT count(*) FROM goal_contributions")
        linha = cur.fetchone()
        assert linha is not None
        assert linha[0] == 0
