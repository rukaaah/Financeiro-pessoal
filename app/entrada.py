"""Tela de entrada: o visitante escolhe entre entrar com Google e ver a demonstração."""

from typing import Literal

import streamlit as st

from app.estilo import aplicar_estilo

Escolha = Literal["google", "demo"]


def tela_de_entrada() -> Escolha | None:
    """Mostra a tela e devolve o que a pessoa escolheu, ou `None` se ainda nada."""
    aplicar_estilo()
    st.title("Financeiro pessoal")
    st.write(
        "Orçamento mensal, cartão por fatura, cofrinhos, valores a receber e "
        "carteira de investimentos, num lugar só."
    )

    escolha: Escolha | None = None
    if st.button("Entrar com Google", type="primary", icon=":material/login:", width="stretch"):
        escolha = "google"
    if st.button("Ver demonstração", icon=":material/visibility:", width="stretch"):
        escolha = "demo"

    st.caption(
        "A demonstração usa dados fictícios, sem login. Contas Google que não estão na "
        "lista de acesso também caem nela."
    )
    return escolha
