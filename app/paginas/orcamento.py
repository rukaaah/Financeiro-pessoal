"""Página "Orçamento" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Orçamento")
st.info(
    "O previsto contra o realizado de cada categoria, mês a mês.", icon=":material/construction:"
)
