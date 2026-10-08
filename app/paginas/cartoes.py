"""Página "Cartões": faturas por mês de vencimento, parcelas futuras e pagamento.

Casos de uso a ligar: `cards.faturas_do_cartao` (view v_invoice), `cards.pagar_fatura`,
`ledger.listar_termos`. A compra vive na fatura; o dinheiro só aparece no débito quando
a fatura é paga (ADR-005, ADR-007). O pagamento aponta a fatura que quita (ADR-010, a
escrever).
"""

from datetime import date
from decimal import Decimal

import streamlit as st

from app import dados
from app.componentes import metrica, tabela
from app.composicao import sessao_atual
from app.formatacao import brl, data_curta, ler_valor, mes_curto, mes_numerico
from app.layout import cabecalho, titulo
from app.modelos import Fatura, SituacaoDaFatura


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


cabecalho(sessao_atual())
titulo("Cartões")

termos = dados.termos_dos_cartoes()
cartao = termos[0].cartao
if len(termos) > 1:
    cartao = st.pills("Cartão", [t.cartao for t in termos], default=cartao) or cartao
atual = next(t for t in termos if t.cartao == cartao)
faturas = dados.faturas(cartao)
aberta = next((f for f in faturas if f.situacao is SituacaoDaFatura.ABERTA), None)

colunas = st.columns(3)
with colunas[0]:
    if aberta is not None:
        metrica(
            "Fatura aberta",
            aberta.total,
            detalhe=f"Vence em {mes_numerico(aberta.mes_de_vencimento)}",
        )
with colunas[1]:
    futuras = sum((f.total for f in faturas if f.situacao is SituacaoDaFatura.FUTURA), Decimal(0))
    metrica("Já comprometido nas próximas", futuras, detalhe="Parcelas que ainda vão cair")
with colunas[2], st.container(border=True):
    st.metric("Fechamento e vencimento", f"dia {atual.fechamento} e dia {atual.vencimento}")
    st.caption(
        f"Como o app do banco mostra. Vale desde {data_curta(atual.vigente_desde)}"
        f"/{atual.vigente_desde.year}. Editável em Configurações."
    )

if st.button("Pagar fatura", icon=":material/payments:", key="abrir_pagar_fatura"):
    dialogo_pagar_fatura(cartao, faturas)

st.subheader("Faturas por mês de vencimento")
tabela(
    [
        {
            "Vencimento": mes_numerico(f.mes_de_vencimento),
            "Situação": f.situacao.value,
            "Total": brl(f.total),
            "Pago em": data_curta(f.pago_em) if f.pago_em else "",
        }
        for f in faturas
    ],
    a_direita=("Total",),
)

st.subheader("Compromisso por fatura")
st.bar_chart(
    {
        "Vencimento": [
            date(f.mes_de_vencimento.year, f.mes_de_vencimento.month, 1) for f in faturas
        ],
        "Total": [float(f.total) for f in faturas],
    },
    x="Vencimento",
    y="Total",
    y_label="R$",
)

st.subheader("Detalhe da fatura")
escolhida = st.selectbox(
    "Fatura",
    faturas,
    index=next((i for i, f in enumerate(faturas) if f is aberta), 0),
    format_func=lambda f: f"{mes_curto(f.mes_de_vencimento)} - {f.situacao.value}",
    key="detalhe_fatura",
)
tabela(
    [
        {
            "Data": data_curta(c.data),
            "Descrição": c.descricao,
            "Categoria": c.categoria,
            "Parcela": c.parcela or "",
            "Valor": brl(c.valor),
        }
        for c in escolhida.compras
    ],
    a_direita=("Valor",),
)
st.caption(
    "Pagamento de fatura não aparece aqui: é transferência, não compra. "
    "Compra no dia do fechamento ainda entra nesta fatura."
)
