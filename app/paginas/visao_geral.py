"""Resumo: quanto ainda posso gastar neste mês, e o que pede atenção.

Duas abas (RF20): **Mês** responde a pergunta das 19h com um número; **Atenção**
lista as pendências com a cor da gravidade. As duas leem a mesma lista de
`app.alertas`.

Revisão de 2026-10-29 (o Pedro viu a v1): sem grade de cartões iguais, sem
tabela para saldo, cor onde há significado.

Dados: `app.dados`. Casos de uso a ligar (ver TODO(claude-code) lá):
`budgeting.resumo_do_mes`, `cards.faturas_do_cartao`, `ledger.saldo_por_conta`.
"""

import calendar
from decimal import Decimal
from html import escape

import streamlit as st

from app import atencao, dados
from app.alertas import em_risco, onde_ainda_cabe, pendencias, saidas_do_mes, visiveis
from app.blocos import (
    Barra,
    Dobra,
    Folga,
    Grupo,
    ItemDaRegua,
    Linha,
    Tom,
    alertas,
    barras,
    colunas,
    destaque,
    dobras,
    folgas,
    icone_do_grupo,
    lista,
    quadro,
    regua,
    secao,
)
from app.formatacao import brl, data_curta, hoje, primeiro_dia_do_mes
from app.layout import titulo_com_mes
from app.modelos import Conta, Estado, SaidaPrevista, SituacaoDaFatura, TipoDeConta, Urgencia


def _linha_da_saida(saida: SaidaPrevista) -> Linha:
    """Uma saída prevista como linha: fatura ou conta, com a vencida em vermelho."""
    fatura = saida.chave.startswith("fatura:")
    vencida = saida.vence_em < hoje()
    return Linha(
        saida.nome,
        brl(saida.valor),
        f"{'Venceu' if vencida else 'Vence'} {data_curta(saida.vence_em)} · {saida.urgencia.value}",
        icone="credit_card" if fatura else "receipt_long",
        cor=1 if fatura else 5,
        tom="fora" if vencida else "neutro",
        selo=("vencida", "over") if vencida else None,
    )


mes = titulo_com_mes("Resumo")

resumo = dados.resumo_do_mes(mes)
orcamento = dados.orcamento_do_mes(mes)
# TODO(claude-code): um cartão só nos exemplos; com mais, iterar `termos_dos_cartoes()`.
termos = dados.termos_dos_cartoes()[0]
faturas = dados.faturas(termos.cartao)
recorrentes = atencao.contas_do_mes(mes)
cofrinhos = dados.cofrinhos(mes)
# Uma lista só para as duas abas (adendo do ADR-011), já sem o adiado e o resolvido.
itens = visiveis(
    pendencias(
        hoje(),
        orcamento,
        faturas,
        cofrinhos,
        dados.pessoas_a_receber(),
        termos.vencimento,
        recorrentes,
    ),
    hoje(),
    atencao.adiados(),
    atencao.resolvidos(),
)
urgentes = [a for a in itens if a.gravidade != "informativo"]
saidas = saidas_do_mes(mes, faturas, termos.vencimento, recorrentes)
em_conta = (
    sum((c.saldo for c in dados.contas() if c.tipo is TipoDeConta.CORRENTE), Decimal(0))
    - atencao.pago_na_sessao()
)
# Conta recorrente pendente já tem destino: sai do "quanto ainda posso gastar". Não
# conta em dobro porque o previsto da categoria dela já está no total (brief, RF20).
# Lê as contas SEM os pagamentos da sessão: no exemplo, pagar não soma ao gasto, e
# tirar a conta das pendentes faria o "posso gastar" subir a cada pagamento.
contas_pendentes = sum((c.valor for c in dados.contas_recorrentes(mes) if c.pendente), Decimal(0))

# A aba escolhida sobrevive ao rerun (adiar, resolver, pagar): sem isso cada
# clique devolvia o usuário para "Mês". O rótulo carrega a contagem, que muda com
# o próprio clique, então o estado é ajustado para o rótulo novo antes de criar as abas.
rotulo_atencao = f"Atenção ({len(urgentes)})"
if str(st.session_state.get("resumo_aba", "")).startswith("Atenção"):
    st.session_state["resumo_aba"] = rotulo_atencao
aba_mes, aba_atencao = st.tabs(["Mês", rotulo_atencao], key="resumo_aba", on_change="rerun")

# ------------------------------------------------------------------------------- Mês
with aba_mes:
    disponivel = resumo.gasto_previsto - resumo.gasto - contas_pendentes
    dias_no_mes = calendar.monthrange(mes.year, mes.month)[1]
    if primeiro_dia_do_mes(hoje()) == mes:
        restantes = dias_no_mes - hoje().day + 1
    elif mes > hoje():
        restantes = dias_no_mes
    else:
        restantes = 0

    tom: Tom
    if disponivel < 0:
        tom = "fora"
        contexto = f"Passou {brl(-disponivel)} do previsto para o mês."
    else:
        tom = "perto" if disponivel < resumo.gasto_previsto * Decimal("0.15") else "dentro"
        contexto = (
            f"{brl(disponivel / restantes)} por dia nos {restantes} dias que faltam."
            if restantes
            else "Mês encerrado."
        ) + (
            f" Já descontadas {brl(contas_pendentes)} em contas a pagar."
            if contas_pendentes
            else ""
        )
    # Painel do topo (revisão de 2026-10-30, "parece vazia"): o número e os quatro
    # que o explicam num bloco só, e ao lado o que pede ação. Tudo o que decide o
    # dia cabe na primeira dobra do desktop.
    numeros = regua(
        (
            ItemDaRegua("Renda", brl(resumo.renda_real), "", "positivo"),
            ItemDaRegua("Gasto", brl(resumo.gasto), f"de {brl(resumo.gasto_previsto)}"),
            ItemDaRegua("Guardado", brl(resumo.guardado), f"de {brl(resumo.guardado_previsto)}"),
            ItemDaRegua(
                "Sobra",
                brl(resumo.sobra),
                "",
                "positivo" if resumo.sobra >= 0 else "negativo",
            ),
        )
    )
    # Ritmo: gastar mais rápido do que o mês passa é o aviso que chega antes do estouro.
    decorridos = dias_no_mes - restantes
    fracao_gasto = float(resumo.gasto / resumo.gasto_previsto) if resumo.gasto_previsto else 0.0
    fracao_mes = decorridos / dias_no_mes
    tom_ritmo: Tom = (
        "fora" if fracao_gasto > 1 else "perto" if fracao_gasto > fracao_mes + 0.05 else "dentro"
    )
    ritmo = barras(
        (
            Barra("Gasto do previsto", fracao_gasto, f"{fracao_gasto:.0%}", tom_ritmo),
            Barra("Mês que passou", fracao_mes, f"dia {decorridos} de {dias_no_mes}", "neutro"),
        )
    )
    principal = destaque(
        "Quanto ainda posso gastar", brl(disponivel), contexto, tom, numeros, corpo=ritmo
    )

    lateral = []
    # Os mesmos itens da aba Atenção, só os primeiros (decisão de 2026-10-29).
    if urgentes:
        lateral.append(
            quadro(
                "Precisa de atenção",
                alertas(urgentes[:4], compacto=True),
                f"{len(urgentes)} na aba Atenção",
            )
        )
    # A pagar: as mesmas saídas da aba Atenção (contas e faturas do mês), mais a
    # fatura aberta que vence no mês seguinte, que já está decidida.
    seguintes = [
        SaidaPrevista(
            f"fatura:{f.cartao}:{f.mes_de_vencimento:%Y-%m}",
            f"Fatura {f.cartao}",
            f.total,
            f.mes_de_vencimento.replace(day=termos.vencimento),
            Urgencia.ESSENCIAL,
        )
        for f in faturas
        if f.situacao is SituacaoDaFatura.ABERTA
        and f.mes_de_vencimento > mes
        and f"fatura:{f.cartao}:{f.mes_de_vencimento:%Y-%m}" not in {x.chave for x in saidas}
    ]
    a_pagar = [*saidas, *seguintes]
    pagar = (
        quadro(
            "A pagar",
            lista([Grupo([_linha_da_saida(x) for x in a_pagar])]),
            brl(sum((x.valor for x in a_pagar), Decimal(0))),
        )
        if a_pagar
        else ""
    )
    st.html(colunas(principal, "".join(lateral), proporcao="principal"))

    # Onde ainda cabe: regra em `alertas.onde_ainda_cabe` (com teste).
    tom_do_estado: dict[Estado, Tom] = {
        Estado.OK: "dentro",
        Estado.ATENCAO: "perto",
        Estado.ESTOUROU: "fora",
    }
    por_categoria = []
    for linha in onde_ainda_cabe(orcamento):
        icone, cor = icone_do_grupo(linha.grupo)
        por_categoria.append(
            Folga(
                linha.categoria,
                brl(linha.livre),
                float(linha.gasto / linha.previsto),
                tom_do_estado[linha.estado],
                icone,
                cor,
            )
        )
    st.html(secao("Onde ainda cabe", "dinheiro do mês"))
    if por_categoria:
        st.html(folgas(por_categoria))
    else:
        st.html('<p class="fin-legenda">Nenhuma categoria com folga neste mês.</p>')

    # Saldo agrupado pelo que o dinheiro está fazendo, não por tipo técnico de conta.
    GRUPOS_DE_CONTA = (
        ("Disponível", (TipoDeConta.CORRENTE, TipoDeConta.DINHEIRO), "account_balance", 1),
        ("Guardado em cofrinhos", (TipoDeConta.COFRINHO,), "savings", 2),
        ("Investido", (TipoDeConta.INVESTIMENTO,), "trending_up", 3),
        ("A receber", (TipoDeConta.A_RECEBER,), "person", 4),
    )
    contas = dados.contas()

    def _linha_da_conta(conta: Conta, icone: str, cor: int) -> Linha:
        return Linha(
            conta.nome.removeprefix("A receber: "),
            brl(conta.saldo),
            icone=icone,
            cor=cor,
            tom="negativo" if conta.saldo < 0 else "neutro",
        )

    # Uma linha por grupo, com o total; as contas abrem com um toque. A lista
    # inteira aberta ocupava mais que o resto da tela junto.
    grupos = []
    for nome, tipos, icone, cor in GRUPOS_DE_CONTA:
        do_grupo = [c for c in contas if c.tipo in tipos]
        if do_grupo:
            total = sum((c.saldo for c in do_grupo), Decimal(0))
            grupos.append(
                Dobra(
                    nome,
                    brl(total),
                    f"{len(do_grupo)} conta" + ("s" if len(do_grupo) > 1 else ""),
                    [_linha_da_conta(c, icone, cor) for c in do_grupo],
                    icone=icone,
                    cor=cor,
                )
            )

    # Nos cofrinhos: dá para gastar nestas categorias sem tirar do mês.
    saldos = {c.nome: c.saldo for c in dados.cofrinhos(mes)}
    com_cofrinho = [linha for linha in orcamento if linha.natureza == "cofrinho" and linha.cofrinho]
    nos_cofrinhos = (
        quadro(
            "Nos cofrinhos",
            lista(
                [
                    Grupo(
                        [
                            Linha(
                                linha.categoria,
                                brl(saldos.get(linha.cofrinho or "", Decimal(0))),
                                f"Cofrinho {linha.cofrinho}",
                                icone="savings",
                                cor=2,
                            )
                            for linha in com_cofrinho
                        ]
                    )
                ]
            ),
            "sem tirar do mês",
        )
        if com_cofrinho
        else ""
    )
    st.html(colunas(quadro("Onde está o dinheiro", dobras(grupos)), pagar + nos_cofrinhos))

# --------------------------------------------------------------------------- Atenção
with aba_atencao:
    a_pagar_no_mes = sum((x.valor for x in saidas), Decimal(0))
    sobra_em_conta = em_conta - a_pagar_no_mes
    n_contas = sum(1 for x in saidas if x.chave.startswith("conta:"))
    n_faturas = len(saidas) - n_contas
    principal_atencao = destaque(
        "A pagar até o fim do mês",
        brl(a_pagar_no_mes),
        (
            f"Sobram {brl(sobra_em_conta)} em conta depois de pagar tudo."
            if sobra_em_conta >= 0
            else f"Faltam {brl(-sobra_em_conta)} em conta para pagar tudo."
        ),
        "dentro" if sobra_em_conta >= 0 else "fora",
        regua(
            (
                ItemDaRegua("Em conta", brl(em_conta), "hoje"),
                ItemDaRegua(
                    "Contas",
                    brl(sum((x.valor for x in saidas if x.chave.startswith("conta:")), Decimal(0))),
                    f"{n_contas} a pagar",
                ),
                ItemDaRegua(
                    "Faturas",
                    brl(
                        sum((x.valor for x in saidas if x.chave.startswith("fatura:")), Decimal(0))
                    ),
                    f"{n_faturas} no mês",
                ),
            )
        ),
    )

    # Em risco: o que o saldo não cobre se for pago na ordem sugerida.
    risco = em_risco(em_conta, saidas, cofrinhos)
    if risco:
        falta_total = sum((r.falta for r in risco), Decimal(0))
        linhas_de_risco = []
        for r in risco:
            if r.cofrinho_que_cobre and r.cofrinho_e_reserva:
                cobre = f"Só a reserva ({r.cofrinho_que_cobre}) cobre, como empréstimo"
            elif r.cofrinho_que_cobre:
                cobre = f"O cofrinho {r.cofrinho_que_cobre} cobre, como empréstimo"
            else:
                cobre = "Nenhum cofrinho cobre sozinho"
            linhas_de_risco.append(
                Linha(
                    r.saida.nome,
                    f"falta {brl(r.falta)}",
                    f"{brl(r.saida.valor)} · vence {data_curta(r.saida.vence_em)} · {cobre}",
                    icone="warning",
                    cor=4,
                    tom="fora",
                    selo=(r.saida.urgencia.value, "warn"),
                )
            )
        lateral_atencao = quadro(
            "Em risco",
            lista([Grupo(linhas_de_risco)])
            + '<p class="fin-legenda">Pague na ordem Essencial, Importante, Adiável. '
            "Nada sai de um cofrinho sem você mandar.</p>",
            f"faltam {brl(falta_total)}",
        )
    else:
        lateral_atencao = quadro(
            "A pagar no mês",
            lista([Grupo([_linha_da_saida(x) for x in saidas])])
            if saidas
            else '<p class="fin-legenda">Nenhuma conta ou fatura vence até o fim do mês.</p>',
            "o saldo cobre tudo",
        )
    st.html(colunas(principal_atencao, lateral_atencao, proporcao="principal"))

    with st.container(horizontal=True, vertical_alignment="center", key="fin-atencao-topo"):
        st.html(secao("Pendências", f"{len(itens)} em aberto" if itens else ""))
        if st.button(
            "Conta recorrente",
            icon=":material/add:",
            key="nova_conta_recorrente",
            type="secondary",
        ):
            atencao.dialogo_conta_recorrente()
    if itens:
        atencao.itens_com_acoes(itens, recorrentes)
    else:
        st.html(
            quadro(
                "Nada pendente",
                '<p class="fin-legenda">'
                + escape(atencao.proximo_vencimento(recorrentes, hoje()))
                + "</p>",
            )
        )
