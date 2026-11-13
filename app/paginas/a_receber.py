"""Página "A receber": o que cada pessoa deve, e o que já foi devolvido.

Casos de uso a ligar: `ledger.valores_a_receber`, `ledger.registrar_recebimento`,
`ledger.perdoar_divida` (RF17). Pagar por alguém é transferência para a conta
"A receber: X", não gasto. Quando o dinheiro veio de cofrinhos (RF18), o recebimento
sugere as devoluções nos valores originais.
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.componentes import metrica, tabela
from app.formatacao import brl, data_curta, ler_valor
from app.layout import titulo
from app.modelos import PessoaAReceber


@st.dialog("Registrar recebimento")
def dialogo_recebimento(pessoa: PessoaAReceber) -> None:
    itens = st.multiselect(
        "Itens que esta quantia quita",
        [f"{data_curta(i.data)} - {i.descricao} ({brl(i.valor)})" for i in pessoa.itens],
        default=[f"{data_curta(i.data)} - {i.descricao} ({brl(i.valor)})" for i in pessoa.itens],
        key=f"recebimento_itens_{pessoa.nome}",
    )
    texto = st.text_input(
        "Valor recebido (R$)",
        value=f"{pessoa.saldo:.2f}".replace(".", ","),
        key=f"recebimento_valor_{pessoa.nome}",
        help="Pode ser parcial: o que sobrar continua em aberto.",
    )
    origens = [(i, o) for i in pessoa.itens for o in i.emprestado_de]
    if origens:
        st.info(
            "Parte deste valor veio de cofrinhos. Depois de registrar, o app sugere devolver: "
            + ", ".join(f"{brl(v)} para {nome}" for _, (nome, v) in origens),
            icon=":material/undo:",
        )
    if st.button("Registrar", type="primary", key=f"recebimento_ok_{pessoa.nome}", width="stretch"):
        valor = ler_valor(texto)
        if valor is None:
            st.error("Informe um valor maior que zero.")
            return
        resultado = dados.registrar_recebimento(pessoa.nome, valor, tuple(itens))
        st.toast(resultado.mensagem)
        st.rerun()


@st.dialog("Perdoar dívida")
def dialogo_perdoar(pessoa: PessoaAReceber) -> None:
    st.write(
        f"O saldo de {brl(pessoa.saldo)} vira despesa na data de hoje e o saldo de "
        f"{pessoa.nome} zera."
    )
    categoria = st.selectbox(
        "Categoria da despesa", dados.categorias_de_despesa(), key=f"perdao_categoria_{pessoa.nome}"
    )
    if st.button("Perdoar", type="primary", key=f"perdao_ok_{pessoa.nome}", width="stretch"):
        resultado = dados.perdoar_divida(pessoa.nome, categoria)
        st.toast(resultado.mensagem)
        st.rerun()


titulo("A receber")

pessoas = dados.pessoas_a_receber()
metrica(
    "Total a receber",
    sum((p.saldo for p in pessoas), Decimal(0)),
    detalhe="Entra no patrimônio, mas não no gasto do mês",
)

for pessoa in pessoas:
    with st.container(border=True):
        st.subheader(pessoa.nome)
        st.metric("Saldo em aberto", brl(pessoa.saldo))
        tabela(
            [
                {
                    "Data": data_curta(i.data),
                    "Descrição": i.descricao,
                    "Dias em aberto": i.dias_em_aberto,
                    "Valor": brl(i.valor),
                }
                for i in pessoa.itens
            ],
            a_direita=("Valor",),
        )
        for item in pessoa.itens:
            if item.emprestado_de:
                st.caption(
                    "Pago com dinheiro dos cofrinhos: "
                    + ", ".join(f"{nome} {brl(valor)}" for nome, valor in item.emprestado_de)
                )
        acoes = st.columns(2)
        if acoes[0].button(
            "Registrar recebimento", key=f"abrir_recebimento_{pessoa.nome}", width="stretch"
        ):
            dialogo_recebimento(pessoa)
        if acoes[1].button("Perdoar dívida", key=f"abrir_perdao_{pessoa.nome}", width="stretch"):
            dialogo_perdoar(pessoa)
        if pessoa.quitacoes:
            with st.expander("Histórico de quitações"):
                tabela(
                    [{"Data": data_curta(d), "Valor": brl(v)} for d, v in pessoa.quitacoes],
                    a_direita=("Valor",),
                )
