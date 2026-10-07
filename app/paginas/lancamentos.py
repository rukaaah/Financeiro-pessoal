"""Página "Lançamentos" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Lançamentos")
st.info(
    "Receitas, despesas e transferências, com importação de extrato.",
    icon=":material/construction:",
)
