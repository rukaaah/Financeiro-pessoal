"""Página "A receber" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("A receber")
st.info("O que cada pessoa deve, e o que já foi devolvido.", icon=":material/construction:")
