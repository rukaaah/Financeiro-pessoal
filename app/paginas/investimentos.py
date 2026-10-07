"""Página "Investimentos" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Investimentos")
st.info(
    "A carteira, com cotações e proventos atualizados pelos jobs.", icon=":material/construction:"
)
