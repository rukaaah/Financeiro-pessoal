"""Diálogos de A receber (RF17), usados na aba A receber de Cofrinhos.

Saíram de `app/paginas/a_receber.py` quando A receber virou aba (ADR-011):
importar a página executaria a tela inteira.
"""

import streamlit as st

from app import dados
from app.formatacao import brl, data_curta, ler_valor
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
