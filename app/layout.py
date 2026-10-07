"""Elementos que aparecem em toda página."""

import streamlit as st

from financeiro.identity.domain.usuario import ModoDeAcesso, Sessao


def cabecalho(sessao: Sessao) -> None:
    """Faixa de aviso e identificação de quem está na sessão.

    A faixa de dados fictícios é a coisa mais importante desta tela: o app é
    público (ADR-002) e quem chega sem estar na allowlist vê números inventados.
    Sem o aviso, eles passariam por reais.
    """
    if sessao.mostrar_faixa_de_dados_ficticios:
        st.warning(
            "**Dados fictícios.** Você está no modo de demonstração: nada aqui "
            "é real, e o que você mexer é apagado toda noite.",
            icon=":material/visibility:",
        )

    with st.sidebar:
        st.caption(sessao.usuario.display_name)
        if sessao.modo is ModoDeAcesso.DEMO:
            st.caption("modo demonstração")
