"""Estilo do app: tokens de design e estilos dos componentes próprios.

Os valores moram em `tokens.css` e `componentes.css`; o tema do Streamlit em
`.streamlit/config.toml`. Aqui só se injeta o CSS na página.
"""

from functools import cache
from pathlib import Path

import streamlit as st

PASTA = Path(__file__).parent
ARQUIVOS = ("tokens.css", "componentes.css")


@cache
def _css() -> str:
    return "\n".join((PASTA / nome).read_text(encoding="utf-8") for nome in ARQUIVOS)


def aplicar_estilo() -> None:
    """Injeta os tokens e os estilos dos componentes. Chamar uma vez por execução."""
    st.html(f"<style>{_css()}</style>")
