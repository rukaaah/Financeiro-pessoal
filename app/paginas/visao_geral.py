"""Página "Visão geral" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Visão geral")
st.info(
    "O resumo do mês: quanto entrou, quanto saiu e quanto sobrou.", icon=":material/construction:"
)
