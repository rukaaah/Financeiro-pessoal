"""Reconstrói o usuário demo com dados fictícios.

Quem visita o app sem estar na allowlist cai aqui (ADR-003). Estes dados são a
primeira impressão do sistema, então precisam parecer um orçamento de verdade:
salário, mercado, uma compra parcelada, pagamento de fatura, cofrinho e uma
dívida de alguém.

**Por que este script fala SQL direto, contrariando o ADR-001**

A regra é que `scripts/` só chame casos de uso. Aqui há três motivos para a
exceção, e eles estão escritos para que a decisão possa ser contestada depois:

1. O script roda como `owner`, não como `app`. Ele administra a allowlist —
   escreve em `app_users`, que o papel da aplicação nem tem permissão de
   alterar. Não é uma operação de usuário, é de manutenção, como uma migration.
2. Não existe caso de uso de "criar usuário demo", e criar um para cada um dos
   sete módulos só para semear dados anteciparia o desenho das fases seguintes.
3. O argumento decisivo: os invariantes que importam vivem no banco (ADR-001).
   Transferência que não soma zero e `invoice_month` errado são recusados pelo
   Postgres mesmo aqui. Este script **não consegue** criar dado inconsistente,
   com ou sem camada de aplicação no caminho.

Quando os casos de uso existirem, vale reescrever o seed sobre eles — aí o
script passaria também a exercitá-los.

Uso:

    export DATABASE_URL=postgresql://owner:dev@localhost:5433/financeiro
    uv run python scripts/seed_demo.py
"""

import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo

import psycopg

EMAIL_DEMO = "demo@financeiro.exemplo"
NOME_DEMO = "Visitante"

# Ids derivados de um namespace fixo: duas execuções produzem exatamente os
# mesmos uuids. Facilita depurar e deixa o diff de um dump vazio quando nada
# mudou de verdade.
NAMESPACE_DEMO = uuid5(NAMESPACE_URL, "https://financeiro.exemplo/demo")


def ident(nome: str) -> UUID:
    return uuid5(NAMESPACE_DEMO, nome)


USUARIO = ident("usuario")

# Unicred de verdade: o ciclo começa dia 4 e a fatura vence dia 11 do mês em
# que ele termina (ADR-007). Usar os números reais faz o demo exercitar a regra
# de verdade, incluindo a compra que atravessa a virada do ciclo.
INICIO_DO_CICLO = 4
VENCIMENTO = 11


@dataclass(frozen=True, slots=True)
class Lancamento:
    """Uma receita ou despesa simples."""

    conta: str
    categoria: str
    valor: str
    dia: int
    descricao: str


# Gastos que se repetem todo mês, para o demo ter série histórica.
RECORRENTES = (
    Lancamento("picpay", "salario", "4200.00", 5, "Salário"),
    Lancamento("picpay", "moradia", "-1450.00", 10, "Aluguel"),
    Lancamento("unicred", "mercado", "-612.40", 8, "Supermercado"),
    Lancamento("unicred", "mercado", "-184.90", 19, "Feira e padaria"),
    Lancamento("unicred", "transporte", "-96.00", 14, "Combustível"),
    Lancamento("unicred", "lazer", "-55.90", 21, "Streaming"),
    # Dia 3 e dia 4 de propósito: um dia de diferença, duas faturas
    # diferentes. É a regra do ADR-007 visível na tela.
    Lancamento("unicred", "mercado", "-238.70", 3, "Compra no último dia do ciclo"),
    Lancamento("unicred", "saude", "-120.00", 4, "Compra no primeiro dia do ciclo"),
)

CONTAS = (
    ("picpay", "PicPay", "checking", None),
    ("unicred", "Unicred", "credit_card", None),
    ("cofrinho", "Cofrinho da viagem", "goal", None),
    ("receber_ana", "A receber de Ana", "receivable", "ana"),
)

GRUPOS = (("essenciais", "Essenciais", 1), ("pessoal", "Pessoal", 2), ("renda", "Renda", 3))

CATEGORIAS = (
    ("mercado", "Mercado", "essenciais", "expense"),
    ("moradia", "Moradia", "essenciais", "expense"),
    ("transporte", "Transporte", "essenciais", "expense"),
    ("lazer", "Lazer", "pessoal", "expense"),
    ("saude", "Saúde", "pessoal", "expense"),
    ("salario", "Salário", "renda", "income"),
)


def primeiro_dia(referencia: date, meses_atras: int) -> date:
    """Primeiro dia do mês `meses_atras` antes de `referencia`."""
    total = referencia.year * 12 + (referencia.month - 1) - meses_atras
    return date(total // 12, total % 12 + 1, 1)


def _transferencia(
    cur: psycopg.Cursor[tuple[object, ...]],
    *,
    de: UUID,
    para: UUID,
    valor: Decimal,
    quando: date,
    descricao: str,
    chave: str,
) -> None:
    """Insere as duas pernas de uma transferência.

    O trigger de soma zero é deferido, então as duas entram antes de qualquer
    verificação; se alguma faltasse, o commit falharia.
    """
    transfer_id = ident(f"transfer:{chave}")
    cur.executemany(
        "INSERT INTO transactions"
        " (id, user_id, kind, account_id, amount, occurred_on, description, transfer_id)"
        " VALUES (%s, %s, 'transfer', %s, %s, %s, %s, %s)",
        [
            (ident(f"{chave}:saida"), USUARIO, de, -valor, quando, descricao, transfer_id),
            (ident(f"{chave}:entrada"), USUARIO, para, valor, quando, descricao, transfer_id),
        ],
    )


def semear(conexao: psycopg.Connection[tuple[object, ...]], hoje: date) -> None:
    """Apaga o demo atual e recria tudo, numa transação só."""
    with conexao.cursor() as cur:
        # ON DELETE CASCADE a partir de app_users leva junto contas, categorias,
        # contrapartes e lançamentos. As duas pernas de cada transferência somem
        # no mesmo comando, que é o que o trigger de soma zero permite.
        cur.execute("DELETE FROM app_users WHERE id = %s OR email = %s", (USUARIO, EMAIL_DEMO))

        cur.execute(
            "INSERT INTO app_users (id, email, display_name, is_demo) VALUES (%s, %s, %s, true)",
            (USUARIO, EMAIL_DEMO, NOME_DEMO),
        )

        cur.execute(
            "INSERT INTO counterparties (id, user_id, name) VALUES (%s, %s, %s)",
            (ident("ana"), USUARIO, "Ana"),
        )

        for chave, nome, tipo, contraparte in CONTAS:
            cur.execute(
                "INSERT INTO accounts (id, user_id, name, kind, counterparty_id)"
                " VALUES (%s, %s, %s, %s, %s)",
                (
                    ident(chave),
                    USUARIO,
                    nome,
                    tipo,
                    ident(contraparte) if contraparte else None,
                ),
            )

        cur.execute(
            "INSERT INTO account_terms"
            " (id, user_id, account_id, vigencia, cycle_start_day, due_day)"
            " VALUES (%s, %s, %s, '[2020-01-01,)', %s, %s)",
            (ident("termos"), USUARIO, ident("unicred"), INICIO_DO_CICLO, VENCIMENTO),
        )

        for chave, nome, ordem in GRUPOS:
            cur.execute(
                "INSERT INTO category_groups (id, user_id, name, sort_order)"
                " VALUES (%s, %s, %s, %s)",
                (ident(chave), USUARIO, nome, ordem),
            )
        for chave, nome, grupo, tipo in CATEGORIAS:
            cur.execute(
                "INSERT INTO categories (id, user_id, group_id, name, kind)"
                " VALUES (%s, %s, %s, %s, %s)",
                (ident(chave), USUARIO, ident(grupo), nome, tipo),
            )

        # Três meses de histórico, terminando no mês corrente.
        for meses_atras in (2, 1, 0):
            mes = primeiro_dia(hoje, meses_atras)
            rotulo = mes.strftime("%Y-%m")

            for indice, lanc in enumerate(RECORRENTES):
                quando = mes.replace(day=lanc.dia)
                if quando > hoje:
                    continue  # não inventa gasto no futuro
                valor = Decimal(lanc.valor)
                cur.execute(
                    "INSERT INTO transactions"
                    " (id, user_id, kind, account_id, category_id, amount,"
                    "  occurred_on, description)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        ident(f"{rotulo}:{indice}"),
                        USUARIO,
                        "income" if valor > 0 else "expense",
                        ident(lanc.conta),
                        ident(lanc.categoria),
                        valor,
                        quando,
                        lanc.descricao,
                    ),
                )

            # Aporte mensal no cofrinho.
            aporte = mes.replace(day=6)
            if aporte <= hoje:
                _transferencia(
                    cur,
                    de=ident("picpay"),
                    para=ident("cofrinho"),
                    valor=Decimal("300.00"),
                    quando=aporte,
                    descricao="Aporte no cofrinho da viagem",
                    chave=f"aporte:{rotulo}",
                )

        # Compra parcelada em 3x, feita há dois meses: as parcelas se espalham
        # por três faturas e mostram o comprometimento futuro da renda.
        compra = primeiro_dia(hoje, 2).replace(day=12)
        grupo_parcelas = ident("parcelas:geladeira")
        for parcela in (1, 2, 3):
            cur.execute(
                "INSERT INTO transactions"
                " (id, user_id, kind, account_id, category_id, amount, occurred_on,"
                "  description, installment_no, installment_total, installment_group_id)"
                " VALUES (%s, %s, 'expense', %s, %s, %s, %s, %s, %s, 3, %s)",
                (
                    ident(f"geladeira:{parcela}"),
                    USUARIO,
                    ident("unicred"),
                    ident("moradia"),
                    Decimal("-433.33"),
                    compra,
                    f"Geladeira {parcela}/3",
                    parcela,
                    grupo_parcelas,
                ),
            )

        # Paga cada fatura já vencida, pelo total exato das compras dela. Com
        # valor fixo o saldo do cartão derivaria e o demo pareceria errado.
        cur.execute(
            "SELECT invoice_month, -sum(amount) FROM transactions"
            " WHERE user_id = %s AND invoice_month IS NOT NULL"
            " GROUP BY invoice_month ORDER BY invoice_month",
            (USUARIO,),
        )
        for mes_fatura, total in cur.fetchall():
            assert isinstance(mes_fatura, date)
            assert isinstance(total, Decimal)
            vencimento = mes_fatura.replace(day=VENCIMENTO)
            if vencimento > hoje or total <= 0:
                continue  # fatura ainda em aberto
            _transferencia(
                cur,
                de=ident("picpay"),
                para=ident("unicred"),
                valor=total,
                quando=vencimento,
                descricao=f"Pagamento da fatura de {mes_fatura:%m/%Y}",
                chave=f"fatura:{mes_fatura:%Y-%m}",
            )

        # Pagar por alguém é transferência, não gasto (RF17): o dinheiro sai da
        # conta mas vira crédito a receber, e volta quando a pessoa paga.
        emprestimo = primeiro_dia(hoje, 1).replace(day=17)
        if emprestimo <= hoje:
            _transferencia(
                cur,
                de=ident("picpay"),
                para=ident("receber_ana"),
                valor=Decimal("180.00"),
                quando=emprestimo,
                descricao="Paguei o jantar da Ana",
                chave="emprestimo:ana",
            )

        devolucao = primeiro_dia(hoje, 0).replace(day=3)
        if devolucao <= hoje:
            _transferencia(
                cur,
                de=ident("receber_ana"),
                para=ident("picpay"),
                valor=Decimal("180.00"),
                quando=devolucao,
                descricao="Ana devolveu",
                chave="devolucao:ana",
            )

        # Uma segunda vez, ainda em aberto: sem ela a tela de valores a receber
        # ficaria zerada, e é justamente o saldo pendente que ela precisa mostrar.
        em_aberto = primeiro_dia(hoje, 0).replace(day=2)
        if em_aberto <= hoje:
            _transferencia(
                cur,
                de=ident("picpay"),
                para=ident("receber_ana"),
                valor=Decimal("64.50"),
                quando=em_aberto,
                descricao="Rachei a conta com a Ana",
                chave="emprestimo2:ana",
            )


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        # Sem a URL no texto do erro: ela é segredo e este repositório é público.
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2

    url = url.replace("postgresql+psycopg://", "postgresql://")

    with psycopg.connect(url) as conexao:
        # Fuso de São Paulo, não o do runner. O reset roda às 03:00 em
        # Brasília, que é 06:00 UTC: `date.today()` num runner em UTC acertaria
        # por acaso hoje e erraria se o horário do cron mudasse.
        hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
        semear(conexao, hoje)
        conexao.commit()

        with conexao.cursor() as cur:
            cur.execute("SELECT count(*) FROM transactions WHERE user_id = %s", (USUARIO,))
            linha = cur.fetchone()
            total = linha[0] if linha else 0

    print(f"Demo reconstruído: {total} lançamentos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
