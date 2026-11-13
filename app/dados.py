"""Fonte de dados das telas.

**HOJE: dados de exemplo.** Este é o único arquivo da interface que sabe de onde os
números vêm, e todos eles são inventados. Cada função marcada com
`TODO(claude-code)` deve passar a chamar o caso de uso real indicado, devolvendo os
mesmos modelos de `app.modelos`; as páginas não mudam.

Regras para quem for ligar os casos de uso (CLAUDE.md, ADR-001):

- a página nunca fala com banco nem com adapter: só chama caso de uso;
- valor monetário é `Decimal`, nunca `float`;
- o usuário da transação vem da sessão (`SET LOCAL app.user_id`), nunca de global.

`DADOS_DE_EXEMPLO` vira `False` quando todas as funções estiverem ligadas; enquanto
for `True`, toda página avisa que os números não são reais, inclusive para o dono.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.formatacao import hoje, primeiro_dia_do_mes, somar_meses
from app.modelos import (
    CategoriaConfigurada,
    Cofrinho,
    CompraNaFatura,
    Conta,
    ContaRecorrente,
    Fatura,
    Fii,
    FonteDeDados,
    ItemAReceber,
    Lancamento,
    LinhaDeImportacao,
    LinhaDeOrcamento,
    MetaDeGuardado,
    ModeloDePrevisto,
    PedidoDeLancamento,
    PessoaAReceber,
    PontoDaProjecao,
    PremissasDeProjecao,
    PreviaDeImportacao,
    RegistroDeAcesso,
    RegraDeCategoria,
    RendaFixa,
    ResumoDoMes,
    SituacaoDaFatura,
    TermosDoCartao,
    TipoDeConta,
    TipoDeLancamento,
    Urgencia,
    UsuarioComAcesso,
)

DADOS_DE_EXEMPLO = True


def _d(texto: str) -> Decimal:
    return Decimal(texto)


@dataclass(frozen=True, slots=True)
class ResultadoDeEscrita:
    ok: bool
    mensagem: str
    gravado: bool


# ------------------------------------------------------------------------ cadastros


def contas() -> tuple[Conta, ...]:
    """Contas do usuário com saldo.

    TODO(claude-code): ledger.application (saldo por conta, view v_account_balance).
    Cofrinhos e CDBs são contas do tipo `goal`; "A receber: X" é `receivable`.
    """
    return (
        Conta("PicPay", TipoDeConta.CORRENTE, _d("1840.35")),
        Conta("Unicred", TipoDeConta.CARTAO, _d("-1204.80"), fechamento=4, vencimento=11),
        Conta("Cofrinho Jogos", TipoDeConta.COFRINHO, _d("300.00")),
        Conta("Cofrinho Reserva", TipoDeConta.COFRINHO, _d("1800.00")),
        Conta("Cofrinho Viagem", TipoDeConta.COFRINHO, _d("950.00")),
        Conta("CDB PicPay", TipoDeConta.COFRINHO, _d("1250.00")),
        Conta("CDB Inter", TipoDeConta.COFRINHO, _d("820.00")),
        Conta("Inter Investimentos", TipoDeConta.INVESTIMENTO, _d("3910.40")),
        Conta("A receber: Ana", TipoDeConta.A_RECEBER, _d("150.00")),
        Conta("A receber: Pais", TipoDeConta.A_RECEBER, _d("350.00")),
    )


def categorias_de_despesa() -> tuple[str, ...]:
    """TODO(claude-code): budgeting.application.listar_categorias (tipo despesa, não arquivadas)."""
    return tuple(c.nome for c in categorias_configuradas() if c.tipo == "Despesa")


def categorias_de_receita() -> tuple[str, ...]:
    """TODO(claude-code): budgeting.application.listar_categorias (tipo receita)."""
    return tuple(c.nome for c in categorias_configuradas() if c.tipo == "Receita")


def categorias_configuradas() -> tuple[CategoriaConfigurada, ...]:
    """TODO(claude-code): budgeting.application.listar_categorias (todas, com arquivadas)."""
    despesas = (
        ("Alimentação", ("Lanches e delivery", "Mercado", "Restaurantes")),
        ("Transporte", ("Apps de transporte", "Combustível", "Passagens")),
        ("Lazer", ("Jogos", "Hobbies", "Saídas e eventos")),
        ("Esporte", ("Muay thai",)),
        ("Casa", ("Contas da casa", "Assinaturas")),
        ("Compras", ("Presentes", "Compras pessoais")),
        ("Contas e taxas", ("Tarifas bancárias",)),
        ("Emergência", ("Imprevistos",)),
        ("Outros", ("Outros",)),
    )
    receitas = (
        ("Trabalho", ("Salário", "Freelance")),
        ("Família", ("Ajuda de custos",)),
        ("Investimentos", ("Rendimentos e proventos",)),
        ("Outros", ("Outras entradas",)),
    )
    # Natureza do gasto (exemplos do próprio Pedro, 2026-10-29).
    # TODO(claude-code): coluna nova em `categories` (natureza + cofrinho
    # vinculado, FK para `accounts` do tipo goal) — pede ADR e migration.
    fixas = {"Muay thai", "Contas da casa", "Assinaturas"}
    por_cofrinho = {"Jogos": "Jogos"}
    itens = [
        CategoriaConfigurada(
            grupo,
            nome,
            "Despesa",
            natureza=(
                "cofrinho" if nome in por_cofrinho else "fixa" if nome in fixas else "variável"
            ),
            cofrinho=por_cofrinho.get(nome),
        )
        for grupo, nomes in despesas
        for nome in nomes
    ]
    itens += [
        CategoriaConfigurada(grupo, nome, "Receita") for grupo, nomes in receitas for nome in nomes
    ]
    return tuple(itens)


def pessoas() -> tuple[str, ...]:
    """TODO(claude-code): ledger.application.listar_contrapartes (counterparties)."""
    return ("Ana", "Pais")


def regras_de_categoria() -> tuple[RegraDeCategoria, ...]:
    """TODO(claude-code): categorization.application.listar_regras."""
    return (
        RegraDeCategoria("UBER", "Apps de transporte", 10),
        RegraDeCategoria("POSTO", "Combustível", 20),
        RegraDeCategoria("MERCADO", "Mercado", 20),
        RegraDeCategoria("IFOOD", "Lanches e delivery", 30),
    )


def termos_dos_cartoes() -> tuple[TermosDoCartao, ...]:
    """TODO(claude-code): ledger.application.listar_termos (account_terms vigentes)."""
    return (TermosDoCartao("Unicred", fechamento=4, vencimento=11, vigente_desde=date(2026, 1, 1)),)


# --------------------------------------------------------------------------- orçamento

_ORCAMENTO_BASE = (
    ("Alimentação", "Lanches e delivery", "250", "0.62"),
    ("Alimentação", "Mercado", "600", "0.95"),
    ("Alimentação", "Restaurantes", "150", "1.10"),
    ("Transporte", "Apps de transporte", "120", "0.48"),
    ("Transporte", "Combustível", "300", "0.88"),
    ("Transporte", "Passagens", "80", "0.00"),
    ("Lazer", "Hobbies", "80", "1.00"),
    ("Lazer", "Jogos", "150", "1.00"),
    ("Lazer", "Saídas e eventos", "200", "0.35"),
    ("Esporte", "Muay thai", "150", "1.00"),
    # Contas recorrentes do exemplo: o realizado é o que já foi pago no fim do mês.
    ("Casa", "Contas da casa", "280", "0.21"),
    ("Casa", "Assinaturas", "45", "0.00"),
    ("Compras", "Presentes", "100", "1.15"),
    ("Compras", "Compras pessoais", "150", "0.90"),
    ("Contas e taxas", "Tarifas bancárias", "20", "1.00"),
    ("Emergência", "Imprevistos", "100", "0.50"),
    ("Outros", "Outros", "50", "0.75"),
)


def orcamento_do_mes(mes: date) -> tuple[LinhaDeOrcamento, ...]:
    """Previsto x realizado por categoria (gasto, sem aportes).

    TODO(claude-code): budgeting.application.orcamento_do_mes (view v_budget_month).
    `previsto` vem do modelo recorrente com o ajuste do mês; `realizado` soma só
    receitas e despesas, nunca transferências; cartão entra no mês de vencimento
    da fatura (ADR-005).
    """
    giro = mes.month % 3
    configuracao = {c.nome: c for c in categorias_configuradas()}
    linhas = []
    for indice, (grupo, categoria, previsto, fator) in enumerate(_ORCAMENTO_BASE):
        previsto_d = _d(previsto)
        ajuste = _d("1.00") + _d("0.05") * ((indice + giro) % 3 - 1)
        realizado = (previsto_d * _d(fator) * ajuste).quantize(_d("0.01"))
        config = configuracao.get(categoria)
        natureza = config.natureza if config else "variável"
        cofrinho = config.cofrinho if config else None
        para_cofrinho = Decimal(0)
        if natureza == "cofrinho":
            # Exemplo das três modalidades: a inserção prevista vai para o
            # cofrinho, a compra sai do cofrinho, e nos meses pares um jogo pago
            # direto com o salário (o caso que aparece no Resumo).
            para_cofrinho = previsto_d
            financiado = realizado
            realizado += _d("80.00") if mes.month % 2 == 0 else Decimal(0)
        else:
            financiado = _d("40.00") if categoria == "Saídas e eventos" else Decimal(0)
        linhas.append(
            LinhaDeOrcamento(
                grupo,
                categoria,
                previsto_d,
                realizado,
                financiado,
                natureza,
                cofrinho,
                para_cofrinho,
            )
        )
    return tuple(linhas)


def metas_de_guardado(mes: date) -> tuple[MetaDeGuardado, ...]:
    """O que foi guardado no mês contra o planejado.

    TODO(claude-code): goals.application.guardado_do_mes (view v_goal_month) e
    investments para aportes. Aporte é transferência; devolução a cofrinho não
    conta como guardado novo (RF18).
    """
    giro = mes.month % 2
    return (
        MetaDeGuardado("Reserva", _d("300"), _d("300")),
        MetaDeGuardado("Investimentos", _d("800"), _d("650") + _d("100") * giro),
        MetaDeGuardado("Cofrinho Jogos", _d("150"), _d("150"), devolucao=_d("60") * giro),
        MetaDeGuardado("Cofrinho Viagem", _d("200"), _d("100")),
    )


def resumo_do_mes(mes: date) -> ResumoDoMes:
    """Totais do mês.

    TODO(claude-code): budgeting.application.resumo_do_mes. Renda base é a
    planejada; renda real inclui a variável (freelance), que aparece como
    "acima do previsto".
    """
    linhas = orcamento_do_mes(mes)
    metas = metas_de_guardado(mes)
    extra = _d("650.00") if mes.month % 2 == 0 else _d("0.00")
    return ResumoDoMes(
        renda_base=_d("4200.00"),
        renda_real=_d("4200.00") + extra,
        gasto=sum(
            (linha.realizado - linha.financiado_por_cofrinho for linha in linhas), Decimal(0)
        ),
        # Categoria paga por cofrinho não tem previsto de gasto do mês: o dinheiro
        # dela é o aporte no cofrinho, que já está em "guardado".
        gasto_previsto=sum(
            (linha.previsto for linha in linhas if linha.natureza != "cofrinho"), Decimal(0)
        ),
        guardado=sum((m.transferido for m in metas), Decimal(0)),
        guardado_previsto=sum((m.planejado for m in metas), Decimal(0)),
    )


def modelo_de_previsto(mes: date) -> tuple[ModeloDePrevisto, ...]:
    """Modelo recorrente do orçamento, com o ajuste deste mês (ou nenhum).

    TODO(claude-code): budgeting.application.modelo_de_previsto. Exige tabela
    nova de modelo recorrente (substitui o "copiar mês anterior" do RF06,
    decisão do grill de 2026-10-08) e `budgets` para os ajustes mensais.
    """
    ajustes = {"Presentes": _d("180.00")} if mes.month == 12 else {}
    return tuple(
        ModeloDePrevisto(categoria, _d(previsto), ajustes.get(categoria))
        for _, categoria, previsto, _ in _ORCAMENTO_BASE
    )


def patrimonio_mensal(ate: date) -> tuple[tuple[date, Decimal], ...]:
    """Patrimônio dos últimos 12 meses (soma das contas, menos faturas em aberto).

    TODO(claude-code): ledger + investments (patrimônio = soma das contas menos
    faturas em aberto).
    """
    inicio = somar_meses(ate, -11)
    return tuple(
        (somar_meses(inicio, i), _d("9200") + _d("430") * i + _d("35") * (i % 4)) for i in range(12)
    )


# ------------------------------------------------------------------------ lançamentos

# (dia, descrição, tipo, conta, categoria, valor, parcela, cofrinho que financiou)
_LANCAMENTOS_BASE: tuple[
    tuple[int, str, TipoDeLancamento, str, str | None, str, str | None, str | None], ...
] = (
    (5, "Salário", TipoDeLancamento.RECEITA, "PicPay", "Salário", "4200.00", None, None),
    (6, "Supermercado", TipoDeLancamento.DESPESA, "Unicred", "Mercado", "-318.40", None, None),
    (
        7,
        "Uber para casa",
        TipoDeLancamento.DESPESA,
        "PicPay",
        "Apps de transporte",
        "-18.90",
        None,
        None,
    ),
    (
        8,
        "Almoço de domingo",
        TipoDeLancamento.DESPESA,
        "Unicred",
        "Restaurantes",
        "-96.00",
        None,
        None,
    ),
    (9, "Combustível", TipoDeLancamento.DESPESA, "Unicred", "Combustível", "-180.00", None, None),
    (10, "Console de jogos", TipoDeLancamento.DESPESA, "Unicred", "Jogos", "-150.00", "2/6", None),
    (
        11,
        "Fone de ouvido",
        TipoDeLancamento.DESPESA,
        "Unicred",
        "Compras pessoais",
        "-80.00",
        "1/3",
        None,
    ),
    (
        12,
        "Show",
        TipoDeLancamento.DESPESA,
        "PicPay",
        "Saídas e eventos",
        "-40.00",
        None,
        "Cofrinho Jogos",
    ),
    (13, "Lanche", TipoDeLancamento.DESPESA, "PicPay", "Lanches e delivery", "-42.50", None, None),
    (
        14,
        "Mensalidade de muay thai",
        TipoDeLancamento.DESPESA,
        "PicPay",
        "Muay thai",
        "-150.00",
        None,
        None,
    ),
    (15, "Freelance", TipoDeLancamento.RECEITA, "PicPay", "Freelance", "650.00", None, None),
    (
        16,
        "Aporte na reserva",
        TipoDeLancamento.TRANSFERENCIA,
        "PicPay",
        None,
        "-300.00",
        None,
        None,
    ),
    (
        16,
        "Aporte na reserva",
        TipoDeLancamento.TRANSFERENCIA,
        "Cofrinho Reserva",
        None,
        "300.00",
        None,
        None,
    ),
    (18, "Compra de cotas", TipoDeLancamento.TRANSFERENCIA, "PicPay", None, "-650.00", None, None),
    (
        18,
        "Compra de cotas",
        TipoDeLancamento.TRANSFERENCIA,
        "Inter Investimentos",
        None,
        "650.00",
        None,
        None,
    ),
    (19, "Presente", TipoDeLancamento.DESPESA, "Unicred", "Presentes", "-115.00", None, None),
    (
        20,
        "Combustível pago pela Ana",
        TipoDeLancamento.TRANSFERENCIA,
        "PicPay",
        None,
        "-50.00",
        None,
        None,
    ),
    (
        20,
        "Combustível pago pela Ana",
        TipoDeLancamento.TRANSFERENCIA,
        "A receber: Ana",
        None,
        "50.00",
        None,
        None,
    ),
    (22, "Tarifa", TipoDeLancamento.DESPESA, "PicPay", "Tarifas bancárias", "-20.00", None, None),
)


def lancamentos_do_mes(mes: date) -> tuple[Lancamento, ...]:
    """Lançamentos do mês, mais recentes primeiro.

    TODO(claude-code): ledger.application.listar_lancamentos (filtros: período, tipo,
    conta, categoria, texto; paginação). Compra de cartão traz `mes_da_fatura`
    calculado no banco (trigger `invoice_month`).
    """
    termos = termos_dos_cartoes()[0]
    itens = []
    for dia, descricao, tipo, conta, categoria, valor, parcela, cofrinho in _LANCAMENTOS_BASE:
        data = mes.replace(day=min(dia, 28))
        fatura = None
        if conta == "Unicred" and tipo is not TipoDeLancamento.TRANSFERENCIA:
            numero = int(parcela.split("/")[0]) if parcela else 1
            fatura = mes_da_fatura(termos.fechamento, termos.vencimento, data, numero)
        itens.append(
            Lancamento(
                data=data,
                descricao=descricao,
                tipo=tipo,
                conta=conta,
                categoria=categoria,
                valor=_d(valor),
                mes_da_fatura=fatura,
                parcela=parcela,
                financiado_por=cofrinho,
            )
        )
    return tuple(sorted(itens, key=lambda lancamento: lancamento.data, reverse=True))


def mes_da_fatura(fechamento: int, vencimento: int, data: date, parcela: int = 1) -> date:
    """Mês de vencimento da fatura em que a compra cai (ADR-005 e ADR-008).

    TODO(claude-code): esta regra já existe no banco (`invoice_month_for`). Para a
    prévia do diálogo "Lançar", expor um caso de uso em `cards.application` que a
    consulte, e apagar esta cópia. Enquanto isso, o espelho abaixo segue a SQL:
    gasto até o dia do fechamento (inclusive) entra na fatura que fecha neste mês;
    se o vencimento não é depois do fechamento, a fatura vence no mês seguinte.
    """
    mes_de_fechamento = primeiro_dia_do_mes(data)
    if data.day > fechamento:
        mes_de_fechamento = somar_meses(mes_de_fechamento, 1)
    mes_de_vencimento = mes_de_fechamento
    if vencimento <= fechamento:
        mes_de_vencimento = somar_meses(mes_de_vencimento, 1)
    return somar_meses(mes_de_vencimento, parcela - 1)


def registrar_lancamento(pedido: PedidoDeLancamento) -> ResultadoDeEscrita:
    """Grava um lançamento (despesa, receita ou transferência de duas pernas).

    TODO(claude-code): ledger.application.registrar_lancamento, numa única unidade
    de trabalho: transferência são duas pernas; compra parcelada gera
    `installment_plans` + N linhas; "paguei por outra pessoa" vira transferência
    para a conta "A receber: X" (RF17); resgate de cofrinho grava a finalidade
    (`goal_movement_kind`, RF18). Nada é gravado hoje.
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso registrar_lancamento.",
        gravado=False,
    )


# ------------------------------------------------------------------------------ cartões


def faturas(cartao: str) -> tuple[Fatura, ...]:
    """Faturas por mês de vencimento: duas pagas, a aberta e cinco futuras.

    TODO(claude-code): cards.application.faturas_do_cartao (view v_invoice). A
    situação "paga" vem da coluna nova na perna de pagamento que aponta a fatura
    que quita (decisão do grill; registrar como ADR-010).
    """
    termos = termos_dos_cartoes()[0]
    aberta = mes_da_fatura(termos.fechamento, termos.vencimento, hoje())
    resultado = []
    for deslocamento in range(-2, 6):
        mes = somar_meses(aberta, deslocamento)
        compras: list[CompraNaFatura] = []
        if deslocamento <= 0:
            compras += [
                CompraNaFatura(mes.replace(day=3), "Supermercado", "Mercado", _d("318.40")),
                CompraNaFatura(mes.replace(day=2), "Combustível", "Combustível", _d("180.00")),
            ]
        if deslocamento <= 0 and deslocamento % 2 == 0:
            compras.append(
                CompraNaFatura(mes.replace(day=1), "Presente", "Presentes", _d("115.00"))
            )
        for numero in range(1, 7):
            if deslocamento == numero - 2:
                compras.append(
                    CompraNaFatura(
                        somar_meses(mes, -numero + 1).replace(day=10),
                        "Console de jogos",
                        "Jogos",
                        _d("150.00"),
                        f"{numero}/6",
                    )
                )
        for numero in range(1, 4):
            if deslocamento == numero - 1:
                compras.append(
                    CompraNaFatura(
                        somar_meses(mes, -numero + 1).replace(day=11),
                        "Fone de ouvido",
                        "Compras pessoais",
                        _d("80.00"),
                        f"{numero}/3",
                    )
                )
        if deslocamento < 0:
            situacao = SituacaoDaFatura.PAGA
            pago_em: date | None = mes.replace(day=termos.vencimento)
        elif deslocamento == 0:
            situacao, pago_em = SituacaoDaFatura.ABERTA, None
        else:
            situacao, pago_em = SituacaoDaFatura.FUTURA, None
        resultado.append(Fatura(cartao, mes, situacao, tuple(compras), pago_em))
    return tuple(resultado)


def pagar_fatura(
    cartao: str, mes_da_fatura_paga: date, conta_de_origem: str, valor: Decimal
) -> ResultadoDeEscrita:
    """Paga uma fatura: transferência da conta corrente para a conta do cartão.

    TODO(claude-code): cards.application.pagar_fatura. A perna de pagamento guarda
    o mês da fatura que quita (coluna nova, ADR-010); continua sem `invoice_month`
    de compra (ADR-007).
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso pagar_fatura.",
        gravado=False,
    )


# ------------------------------------------------------------------ contas recorrentes

# (nome, valor, varia, dia, categoria, conta, urgência, avisar dias antes)
_CONTAS_RECORRENTES = (
    ("Conta de luz", "120.00", True, 28, "Contas da casa", "PicPay", Urgencia.ESSENCIAL, 3),
    ("Internet", "100.00", False, 31, "Contas da casa", "PicPay", Urgencia.IMPORTANTE, 3),
    ("Celular", "60.00", False, 20, "Contas da casa", "PicPay", Urgencia.IMPORTANTE, 3),
    ("Muay thai", "150.00", False, 10, "Muay thai", "PicPay", Urgencia.IMPORTANTE, 3),
    ("Streaming", "45.00", False, 31, "Assinaturas", "PicPay", Urgencia.ADIAVEL, 2),
)
# Pendente de propósito no exemplo, para a tela mostrar uma conta vencida.
_VENCIDA_NO_EXEMPLO = "Conta de luz"


def contas_recorrentes(mes: date) -> tuple[ContaRecorrente, ...]:
    """Contas recorrentes do mês, com o que já foi pago (RF20).

    Exemplo: meses passados estão todos pagos; no mês corrente, o que venceu antes
    de hoje foi pago, menos a conta de luz (para mostrar o crítico); meses futuros
    estão em aberto. Vencimento num dia que o mês não tem cai no último dia.

    TODO(claude-code): alerts.application.contas_do_mes, sobre `recurring_bills`
    (com vigência: mudar o valor cria vigência nova, meses passados não mudam).
    """
    ultimo = calendar.monthrange(mes.year, mes.month)[1]
    atual = primeiro_dia_do_mes(hoje())
    contas = []
    for nome, valor, varia, dia, categoria, conta, urgencia, avisar in _CONTAS_RECORRENTES:
        vence = mes.replace(day=min(dia, ultimo))
        if mes < atual:
            paga_em: date | None = vence
        elif mes == atual and vence < hoje() and nome != _VENCIDA_NO_EXEMPLO:
            paga_em = vence
        else:
            paga_em = None
        contas.append(
            ContaRecorrente(
                nome,
                _d(valor),
                dia,
                categoria,
                conta,
                urgencia,
                vence,
                varia,
                avisar,
                paga_em,
            )
        )
    return tuple(contas)


def pagar_conta_recorrente(
    nome: str, mes: date, valor: Decimal, conta_de_origem: str
) -> ResultadoDeEscrita:
    """Paga a conta do mês: lançamento de despesa ligado à conta recorrente.

    TODO(claude-code): alerts.application.pagar_conta (lançamento + vínculo com
    `recurring_bills` do mês, na mesma unidade de trabalho).
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso pagar_conta.",
        gravado=False,
    )


def salvar_conta_recorrente(conta: ContaRecorrente) -> ResultadoDeEscrita:
    """Cadastra ou edita uma conta recorrente.

    TODO(claude-code): alerts.application.salvar_conta_recorrente.
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso de contas recorrentes.",
        gravado=False,
    )


# --------------------------------------------------------------------------- cofrinhos


def cofrinhos(mes: date) -> tuple[Cofrinho, ...]:
    """Um cartão por cofrinho, com as métricas do RF14 e o "a devolver" do RF18.

    TODO(claude-code): goals.application.cofrinhos_do_mes (view v_goal_month).
    CDBs são cofrinhos com `percentual_do_cdi`.
    """

    def serie(inicial: str, passo: str, folga: str) -> tuple[tuple[date, Decimal, Decimal], ...]:
        return tuple(
            (
                somar_meses(mes, i - 5),
                _d(inicial) + _d(passo) * i,
                _d(inicial) + _d(passo) * i + _d(folga) * (1 if i % 2 else -1),
            )
            for i in range(6)
        )

    return (
        Cofrinho(
            "Jogos",
            _d("300.00"),
            _d("450.00"),
            _d("300.00"),
            _d("150.00"),
            Decimal(0),
            Decimal(0),
            _d("60.00"),
            18,
            historico=serie("0", "60", "20"),
        ),
        Cofrinho(
            "Reserva",
            _d("1800.00"),
            _d("3000.00"),
            _d("2100.00"),
            _d("300.00"),
            _d("100.00"),
            _d("0.00"),
            _d("100.00"),
            12,
            _d("14.20"),
            reserva_de_emergencia=True,
            historico=serie("1000", "160", "60"),
        ),
        Cofrinho(
            "Viagem",
            _d("950.00"),
            _d("2400.00"),
            _d("800.00"),
            _d("100.00"),
            Decimal(0),
            Decimal(0),
            Decimal(0),
            None,
            historico=serie("350", "100", "40"),
        ),
        Cofrinho(
            "CDB PicPay",
            _d("1250.00"),
            None,
            None,
            _d("100.00"),
            Decimal(0),
            Decimal(0),
            Decimal(0),
            None,
            _d("10.30"),
            percentual_do_cdi=_d("100"),
        ),
        Cofrinho(
            "CDB Inter",
            _d("820.00"),
            None,
            None,
            _d("90.00"),
            Decimal(0),
            Decimal(0),
            Decimal(0),
            None,
            _d("7.10"),
            percentual_do_cdi=_d("102"),
        ),
    )


def registrar_movimento_de_cofrinho(
    cofrinho: str, entrada: bool, valor: Decimal, detalhe: str
) -> ResultadoDeEscrita:
    """Aporta ou resgata. Resgate exige finalidade; aporte só abate dívida se for devolução.

    TODO(claude-code): goals.application.aportar / resgatar (RF14 e RF18).
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar os casos de uso de cofrinho.",
        gravado=False,
    )


# --------------------------------------------------------------------------- a receber


def pessoas_a_receber() -> tuple[PessoaAReceber, ...]:
    """Saldo por pessoa, itens em aberto e quitações.

    TODO(claude-code): ledger.application.valores_a_receber (contas `receivable`
    por contraparte, RF17), com o vínculo ao cofrinho de origem (RF18).
    """
    base = hoje()
    return (
        PessoaAReceber(
            "Ana",
            (
                ItemAReceber(base - timedelta(days=9), "Combustível", _d("50.00"), 9),
                ItemAReceber(base - timedelta(days=3), "Parte da conta do jantar", _d("100.00"), 3),
            ),
            quitacoes=((base - timedelta(days=40), _d("80.00")),),
        ),
        PessoaAReceber(
            "Pais",
            (
                ItemAReceber(
                    base - timedelta(days=6),
                    "Consulta paga com dinheiro dos cofrinhos",
                    _d("350.00"),
                    6,
                    emprestado_de=(("Reserva", _d("200.00")), ("Jogos", _d("150.00"))),
                ),
            ),
        ),
    )


def registrar_recebimento(
    pessoa: str, valor: Decimal, itens: tuple[str, ...]
) -> ResultadoDeEscrita:
    """Quita um ou mais itens, inclusive parcialmente.

    TODO(claude-code): ledger.application.registrar_recebimento. Se os itens vieram de
    dinheiro de cofrinhos, sugerir as devoluções nos valores originais (RF18).
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso registrar_recebimento.",
        gravado=False,
    )


def perdoar_divida(pessoa: str, categoria: str) -> ResultadoDeEscrita:
    """Converte o saldo em despesa na categoria escolhida, na data do perdão.

    TODO(claude-code): ledger.application.perdoar_divida (RF17).
    """
    return ResultadoDeEscrita(
        ok=True,
        mensagem="Exemplo: nada foi gravado. Falta ligar o caso de uso perdoar_divida.",
        gravado=False,
    )


# --------------------------------------------------------------------------- investimentos


def fiis() -> tuple[Fii, ...]:
    """Posição em FIIs com os indicadores lidos do Investidor10.

    TODO(claude-code): investments.application.carteira + market_data (job agendado
    no GitHub Actions grava `asset_prices`; a tela lê do banco, nunca da web).
    Tickers e números abaixo são FICTÍCIOS de propósito: nenhum indicador de
    FII real deve aparecer antes do scraper existir.
    """
    lido = hoje()
    return (
        Fii(
            "DEMO11",
            12,
            _d("100.00"),
            _d("98.50"),
            _d("9.2"),
            _d("0.97"),
            _d("0.8"),
            _d("0.90"),
            False,
            lido,
        ),
        Fii(
            "TESTE11",
            20,
            _d("95.00"),
            _d("97.00"),
            _d("10.1"),
            _d("0.91"),
            _d("-0.4"),
            _d("0.95"),
            True,
            lido,
        ),
        Fii(
            "EXEMP11",
            5,
            _d("140.00"),
            _d("135.00"),
            _d("8.4"),
            _d("1.02"),
            _d("1.1"),
            _d("1.05"),
            False,
            lido,
        ),
    )


def renda_fixa() -> tuple[RendaFixa, ...]:
    """CDBs (cofrinhos) e Tesouro Selic.

    TODO(claude-code): investments.application.renda_fixa; CDB = cofrinho com
    `percentual_do_cdi`; valor de mercado do Tesouro vem do Tesouro Transparente.
    """
    return (
        RendaFixa("CDB PicPay", _d("1250.00"), _d("100")),
        RendaFixa("CDB Inter", _d("820.00"), _d("102")),
        RendaFixa("Tesouro Selic", _d("1500.00"), None),
    )


def fontes_de_dados() -> tuple[FonteDeDados, ...]:
    """Origem e data da última leitura de cada dado externo.

    TODO(claude-code): market_data.application.situacao_das_fontes. Falha de fonte
    não quebra a tela: mostra o último dado com a data.
    """
    return (
        FonteDeDados("Investidor10 (cotação, DY, P/VP, proventos)", hoje()),
        FonteDeDados("BCB SGS (CDI e Selic)", hoje()),
        FonteDeDados("Tesouro Transparente (preço do Tesouro)", hoje()),
    )


def taxa_cdi_de_exemplo() -> Decimal:
    """CDI anual, em pontos percentuais. VALOR DE EXEMPLO.

    TODO(claude-code): market_data.application.cdi_atual (BCB SGS). Não confiar
    neste número: serve só para a tela calcular algo antes da fonte existir.
    """
    return _d("10.00")


def premissas_padrao() -> PremissasDeProjecao:
    """Premissas iniciais da projeção.

    TODO(claude-code): investments.application.premissas_padrao: DY médio dos
    últimos 12 meses da carteira e valorização histórica, editáveis pelo usuário.
    """
    return PremissasDeProjecao(_d("650.00"), _d("9.0"), _d("3.0"), True)


def projetar(premissas: PremissasDeProjecao, meses: int) -> tuple[PontoDaProjecao, ...]:
    """Projeta patrimônio e renda mensal da carteira de FIIs mês a mês.

    TODO(claude-code): mover para `investments.domain` (regra pura, com testes) e
    chamar por um caso de uso. É uma conta com premissas visíveis, não uma
    previsão de mercado.
    """
    patrimonio = sum((f.valor_de_mercado for f in fiis()), Decimal(0))
    valorizacao_mensal = (_d("1") + premissas.valorizacao_anual / 100) ** (_d("1") / 12) - 1
    dy_mensal = premissas.dy_anual / 100 / 12
    pontos = [PontoDaProjecao(0, patrimonio, patrimonio * dy_mensal)]
    for mes in range(1, meses + 1):
        patrimonio = (patrimonio + premissas.aporte_mensal) * (1 + valorizacao_mensal)
        renda = patrimonio * dy_mensal
        if premissas.reinvestir_proventos:
            patrimonio += renda
        pontos.append(PontoDaProjecao(mes, patrimonio, renda))
    return tuple(pontos)


# --------------------------------------------------------------------------- importação


def previa_de_importacao() -> PreviaDeImportacao:
    """Prévia de um extrato de exemplo, para a tela de revisão.

    TODO(claude-code): importing.application.ler_extrato (adapter PicPay em PDF com
    pdfplumber; valida pelo saldo diário; deduplica por hash). O arquivo é
    processado em memória e descartado; CPF e número da conta nunca são guardados.
    """
    fim = hoje()
    inicio = fim - timedelta(days=6)
    linhas = (
        LinhaDeImportacao(
            True, inicio, "COMPRA MERCADO CENTRAL", _d("-86.40"), "Despesa", "Mercado"
        ),
        LinhaDeImportacao(
            True,
            inicio + timedelta(days=1),
            "PIX RECEBIDO ANA",
            _d("50.00"),
            "Quitação sugerida",
            None,
            observacao="Casa com 'Combustível' (Ana)",
        ),
        LinhaDeImportacao(
            True,
            inicio + timedelta(days=2),
            "DINHEIRO RESGATADO COFRINHO JOGOS",
            _d("65.00"),
            "Transferência",
            None,
            observacao="Par com a compra seguinte",
        ),
        LinhaDeImportacao(
            True,
            inicio + timedelta(days=2),
            "COMPRA LOJA DE JOGOS",
            _d("-65.00"),
            "Despesa financiada",
            "Jogos",
            observacao="Financiada pelo cofrinho Jogos",
        ),
        LinhaDeImportacao(
            True,
            inicio + timedelta(days=4),
            "UBER *TRIP",
            _d("-22.30"),
            "Despesa",
            "Apps de transporte",
        ),
        LinhaDeImportacao(
            False,
            inicio + timedelta(days=5),
            "COMPRA MERCADO CENTRAL",
            _d("-86.40"),
            "Despesa",
            "Mercado",
            duplicada=True,
            observacao="Já importada",
        ),
    )
    return PreviaDeImportacao(
        "PicPay", (inicio, fim), linhas, dias_conferidos=7, dias_com_divergencia=0
    )


# ---------------------------------------------------------------------------- acesso


def usuarios_com_acesso() -> tuple[UsuarioComAcesso, ...]:
    """Pessoas na allowlist.

    TODO(claude-code): identity.application.admin_listar_usuarios, que chama a
    função SECURITY DEFINER do banco (RF19). A regra "só admin" vale no banco; esconder
    a página não basta.
    """
    return (
        UsuarioComAcesso("dono@exemplo.com", "Dono", True, date(2026, 10, 1), admin=True),
        UsuarioComAcesso("pessoa1@exemplo.com", "Pessoa 1", True, date(2026, 10, 3)),
        UsuarioComAcesso("pessoa2@exemplo.com", "Pessoa 2", False, date(2026, 10, 3)),
    )


def registro_de_acesso() -> tuple[RegistroDeAcesso, ...]:
    """TODO(claude-code): identity.application.admin_registro (tabela access_log, RF19)."""
    return (
        RegistroDeAcesso(date(2026, 10, 3), "dono@exemplo.com", "adicionou", "pessoa2@exemplo.com"),
        RegistroDeAcesso(date(2026, 10, 5), "dono@exemplo.com", "desativou", "pessoa2@exemplo.com"),
    )


def eh_admin_de_exemplo(dono: bool) -> bool:
    """O usuário vê a página "Acesso"?

    TODO(claude-code): trocar por `app_users.is_admin` (coluna nova, RF19), vinda da
    sessão. Hoje, todo dono é tratado como admin só para a tela existir.
    """
    return dono
