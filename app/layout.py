"""Elementos que aparecem em toda página."""

import streamlit as st

from app.componentes import aviso_de_exemplo, botao_lancar
from app.dados import DADOS_DE_EXEMPLO
from app.estilo import aplicar_estilo
from financeiro.identity.domain.usuario import ModoDeAcesso, Sessao


def cabecalho(sessao: Sessao) -> None:
    """Estilo, faixa de aviso e identificação de quem está na sessão.

    A faixa de dados fictícios é a coisa mais importante desta tela: o app é
    público (ADR-002) e quem chega sem estar na allowlist vê números inventados.
    Sem o aviso, eles passariam por reais.

    Quem está logado como dono, enquanto os casos de uso não estão ligados
    (`DADOS_DE_EXEMPLO`), também vê um aviso: os números são de exemplo.
    """
    aplicar_estilo()

    if sessao.mostrar_faixa_de_dados_ficticios:
        st.warning(
            "**Dados fictícios.** Você está no modo de demonstração: nada aqui "
            "é real, e o que você mexer é apagado toda noite.",
            icon=":material/visibility:",
        )
    elif DADOS_DE_EXEMPLO:
        aviso_de_exemplo()

    with st.sidebar:
        st.caption(sessao.usuario.display_name)
        if sessao.modo is ModoDeAcesso.DEMO:
            st.caption("modo demonstração")
        botao_lancar("lancar_lateral")


def titulo(texto: str) -> None:
    """Título da página com a ação principal ao lado (útil no celular, sem barra lateral)."""
    coluna_titulo, coluna_acao = st.columns([3, 1], vertical_alignment="center")
    coluna_titulo.title(texto)
    with coluna_acao:
        botao_lancar("lancar_topo")
