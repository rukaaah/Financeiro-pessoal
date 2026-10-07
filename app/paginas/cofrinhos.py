"""Página "Cofrinhos" — ainda sem conteúdo (Fase 0)."""

import streamlit as st

from app.composicao import sessao_atual
from app.layout import cabecalho

cabecalho(sessao_atual())

st.title("Cofrinhos")
st.info(
    "Quanto está guardado em cada objetivo, e o que foi emprestado a devolver.",
    icon=":material/construction:",
)
