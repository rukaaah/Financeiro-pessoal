"""Página "Cartões" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Cartões")
st.info(
    "As faturas por mês de vencimento, com as parcelas que ainda vão cair.",
    icon=":material/construction:",
)
