"""Página "Cartões": faturas por mês de vencimento, parcelas futuras e pagamento.

Casos de uso a ligar: `cards.faturas_do_cartao` (view v_invoice), `cards.pagar_fatura`,
`ledger.listar_termos`. A compra vive na fatura; o dinheiro só aparece no débito quando
a fatura é paga (ADR-005, ADR-007). O pagamento aponta a fatura que quita (ADR-010, a
escrever).
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.blocos import (
    Barra,
    Grupo,
    ItemDaRegua,
    Linha,
    barras,
    colunas,
    destaque,
    icone_do_grupo,
    lista,
    quadro,
    regua,
    secao,
)
from app.formatacao import brl, data_curta, hoje, ler_valor, mes_curto, mes_numerico
from app.layout import titulo
from app.modelos import Fatura, SituacaoDaFatura

# Situação → selo (texto, classe) e tom do valor. Selo sempre escrito (brief).
VISUAL_DA_SITUACAO = {
    SituacaoDaFatura.PAGA: (("paga", "ok"), "neutro"),
    SituacaoDaFatura.ABERTA: (("aberta", "warn"), "neutro"),
    SituacaoDaFatura.FUTURA: (("futura", "informativo"), "neutro"),
}


@st.dialog("Pagar fatura")
def dialogo_pagar_fatura(cartao: str, faturas: tuple[Fatura, ...]) -> None:
    """O pagamento é uma transferência que aponta a fatura que quita."""
    pagaveis = [f for f in faturas if f.situacao is not SituacaoDaFatura.PAGA]
    escolhida = st.selectbox(
        "Fatura que este pagamento quita",
        pagaveis,
        format_func=lambda f: f"{mes_numerico(f.mes_de_vencimento)} - {brl(f.total)}",
        key="pagar_fatura_qual",
    )
    origem = st.selectbox(
        "Pagar com",
        [c.nome for c in dados.contas() if c.tipo.value == "corrente"],
        key="pagar_fatura_origem",
    )
    texto = st.text_input(
        "Valor (R$)",
        value=f"{escolhida.total:.2f}".replace(".", ","),
        key="pagar_fatura_valor",
        help="Pagamento parcial é permitido; o restante continua em aberto.",
    )
    if st.button("Pagar", type="primary", key="pagar_fatura_ok", width="stretch"):
        valor = ler_valor(texto)
        if valor is None:
            st.error("Informe um valor maior que zero, como 154,35.")
            return
        resultado = dados.pagar_fatura(cartao, escolhida.mes_de_vencimento, origem, valor)
        st.toast(resultado.mensagem)
        st.rerun()


titulo("Cartões")

termos = dados.termos_dos_cartoes()
cartao = termos[0].cartao
if len(termos) > 1:
    cartao = st.pills("Cartão", [t.cartao for t in termos], default=cartao) or cartao
atual = next(t for t in termos if t.cartao == cartao)
faturas = dados.faturas(cartao)
aberta = next((f for f in faturas if f.situacao is SituacaoDaFatura.ABERTA), None)

futuras = [f for f in faturas if f.situacao is SituacaoDaFatura.FUTURA]
comprometido = sum((f.total for f in futuras), Decimal(0))
numeros = regua(
    (
        ItemDaRegua("Já comprometido", brl(comprometido), f"em {len(futuras)} faturas"),
        ItemDaRegua("Fechamento", f"dia {atual.fechamento}", "como o app do banco"),
        ItemDaRegua("Vencimento", f"dia {atual.vencimento}", "editável em Ajustes"),
    )
)
# Só a vizinhança da fatura aberta: a última paga e as três próximas. O
# histórico inteiro continua no seletor de "Compras da fatura", logo abaixo.
em_ordem = sorted(faturas, key=lambda f: f.mes_de_vencimento)
pagas = [f for f in em_ordem if f.situacao is SituacaoDaFatura.PAGA]
proximas = [f for f in em_ordem if f.situacao is not SituacaoDaFatura.PAGA]
vizinhanca = pagas[-1:] + proximas[:4]

if aberta is not None:
    # Esta fatura contra a anterior: diz de relance se o mês está mais pesado.
    comparacao = ""
    if pagas:
        anterior = pagas[-1]
        teto = max(aberta.total, anterior.total) or Decimal(1)
        comparacao = barras(
            (
                Barra("Esta fatura", float(aberta.total / teto), brl(aberta.total)),
                Barra(
                    mes_curto(anterior.mes_de_vencimento).capitalize(),
                    float(anterior.total / teto),
                    brl(anterior.total),
                    "neutro",
                ),
            )
        )
    vence = aberta.mes_de_vencimento.replace(day=atual.vencimento)
    faltam = (vence - hoje()).days
    principal = destaque(
        "Fatura aberta",
        brl(aberta.total),
        f"Vence {data_curta(vence)}"
        + (f", em {faltam} dias" if 0 <= faltam <= 31 else "")
        + f" · fecha dia {atual.fechamento}",
        "perto" if 0 <= faltam <= 7 else "neutro",
        numeros,
        corpo=comparacao,
    )
else:
    principal = destaque(
        "Fatura aberta", brl(Decimal(0)), "Nenhuma fatura em aberto.", "dentro", numeros
    )

# Faturas como lista com barra proporcional ao maior total: compara sem gráfico à parte.
# Ao lado do destaque (revisão de 2026-10-30): a primeira dobra mostra o cartão inteiro.
maior = max((f.total for f in faturas), default=Decimal(0)) or Decimal(1)
lista_de_faturas = quadro(
    "Faturas",
    lista(
        [
            Grupo(
                [
                    Linha(
                        mes_curto(f.mes_de_vencimento).capitalize(),
                        brl(f.total),
                        f"{len(f.compras)} compras"
                        + (f" · paga em {data_curta(f.pago_em)}" if f.pago_em else ""),
                        icone="credit_card",
                        cor=1 if f.situacao is SituacaoDaFatura.ABERTA else 6,
                        selo=VISUAL_DA_SITUACAO[f.situacao][0],
                        progresso=float(f.total / maior),
                    )
                    for f in vizinhanca
                ]
            )
        ]
    ),
    f"{len(faturas)} no total",
)
st.html(colunas(principal, lista_de_faturas, proporcao="principal"))
if st.button(
    "Pagar fatura",
    icon=":material/payments:",
    type="secondary",
    key="abrir_pagar_fatura",
    width="content",
):
    dialogo_pagar_fatura(cartao, faturas)

st.html(secao("Compras da fatura"))
escolhida = st.selectbox(
    "Fatura",
    faturas,
    index=next((i for i, f in enumerate(faturas) if f is aberta), 0),
    format_func=lambda f: f"{mes_curto(f.mes_de_vencimento)} · {f.situacao.value.lower()}",
    key="detalhe_fatura",
    label_visibility="collapsed",
)
grupo_da_categoria = {c.nome: c.grupo for c in dados.categorias_configuradas()}
compras = []
for c in sorted(escolhida.compras, key=lambda c: c.data, reverse=True):
    icone, cor = icone_do_grupo(grupo_da_categoria.get(c.categoria))
    compras.append(
        Linha(
            c.descricao,
            brl(c.valor),
            f"{data_curta(c.data)} · {c.categoria}"
            + (f" · parcela {c.parcela}" if c.parcela else ""),
            icone=icone,
            cor=cor,
        )
    )
st.html(lista([Grupo(compras, "", "")]) if compras else secao("Nenhuma compra"))
st.caption(
    "Pagamento de fatura não aparece aqui: é transferência, não compra. "
    "Compra no dia do fechamento ainda entra nesta fatura."
)
