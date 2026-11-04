"""Componentes de tela reaproveitados pelas páginas.

Visual sóbrio: cor só para o estado do orçamento (tokens em `app/estilo`). Todo
estado leva ícone e rótulo, nunca só cor.
"""

from datetime import date
from decimal import Decimal
from html import escape

import streamlit as st

from app.formatacao import (
    brl,
    hoje,
    mes_extenso,
    primeiro_dia_do_mes,
    somar_meses,
)
from app.lancar import dialogo_lancar
from app.modelos import (
    ROTULO_DO_ESTADO,
    Estado,
    LinhaDeOrcamento,
    estado_do_gasto,
)

# --------------------------------------------------------------------- HTML puro


def selo(estado: Estado, texto: str | None = None) -> str:
    rotulo = escape(texto or ROTULO_DO_ESTADO[estado])
    return f'<span class="fin-selo fin-selo--{estado.value}">{rotulo}</span>'


def barra(realizado: Decimal, previsto: Decimal) -> str:
    """Barra de progresso do realizado contra o previsto, com rótulo para leitor de tela."""
    if previsto > 0:
        largura = min(realizado / previsto, Decimal(1)) * 100
    else:
        largura = Decimal(100) if realizado > 0 else Decimal(0)
    estado = estado_do_gasto(realizado, previsto)
    descricao = escape(f"{brl(realizado)} de {brl(previsto)}")
    return (
        f'<div class="fin-barra fin-barra--{estado.value}" role="img" aria-label="{descricao}">'
        f'<span style="width:{largura:.0f}%"></span></div>'
    )


def linha_de_orcamento(linha: LinhaDeOrcamento) -> str:
    gasto = linha.realizado - linha.financiado_por_cofrinho
    nota = ""
    if linha.financiado_por_cofrinho > 0:
        nota = (
            f'<span class="fin-legenda">{brl(linha.financiado_por_cofrinho)} '
            "pagos com dinheiro de cofrinho</span>"
        )
    return (
        '<div class="fin-linha">'
        '<div class="fin-linha__topo">'
        f'<span class="fin-linha__nome">{escape(linha.categoria)}</span>'
        f'<span class="fin-valor">{brl(gasto)} de {brl(linha.previsto)}</span>'
        "</div>"
        f"{barra(gasto, linha.previsto)}"
        f'<div class="fin-linha__rodape">{selo(linha.estado)}{nota}</div>'
        "</div>"
    )


# ----------------------------------------------------------------- componentes Streamlit


def metrica(
    rotulo: str,
    valor: Decimal,
    *,
    detalhe: str | None = None,
    estado: Estado | None = None,
    ajuda: str | None = None,
) -> None:
    """Número com rótulo, num cartão. O detalhe fica abaixo, em texto neutro."""
    with st.container(border=True):
        st.metric(rotulo, brl(valor), help=ajuda)
        if detalhe:
            st.caption(detalhe)
        if estado is not None:
            st.html(selo(estado))


CHAVE_DO_MES = "mes"


def mes_global() -> date:
    """O mês do app inteiro (ADR-011), sempre dia 1. Começa no mês corrente."""
    if CHAVE_DO_MES not in st.session_state:
        st.session_state[CHAVE_DO_MES] = primeiro_dia_do_mes(hoje())
    mes: date = st.session_state[CHAVE_DO_MES]
    return mes


def _mover_mes(passo: int) -> None:
    st.session_state[CHAVE_DO_MES] = somar_meses(mes_global(), passo)


def seletor_de_mes() -> date:
    """Seletor "< Outubro de 2026 >", numa linha, centralizado, logo abaixo do título.

    Um estado só para o app inteiro: trocar o mês aqui troca em toda tela que
    depende dele. Investimentos e Ajustes não chamam isto — um controle sem
    efeito seria mentira de interface.
    """
    mes = mes_global()
    with st.container(
        horizontal=True,
        horizontal_alignment="center",
        vertical_alignment="center",
        gap="small",
        key="fin-mes",
    ):
        # Rótulo de texto escondido só visualmente (CSS): sem ele o leitor de tela
        # leria o nome do ícone, "chevron_left".
        st.button(
            "Mês anterior",
            icon=":material/chevron_left:",
            key="mes_anterior",
            on_click=_mover_mes,
            args=(-1,),
            type="tertiary",
            width="content",
        )
        # aria-live: o leitor de tela anuncia o mês novo depois do clique.
        rotulo = escape(mes_extenso(mes).capitalize())
        st.html(f'<span class="fin-mes" aria-live="polite">{rotulo}</span>', width="content")
        st.button(
            "Próximo mês",
            icon=":material/chevron_right:",
            key="mes_proximo",
            on_click=_mover_mes,
            args=(1,),
            type="tertiary",
            width="content",
        )
    return mes


def aviso_de_exemplo() -> None:
    """Avisa que a tela mostra dados de exemplo, mesmo para quem está logado.

    Sem isto, o dono veria números inventados sem saber (ver `app.dados`).
    """
    st.info(
        "**Pré-visualização.** Estes números são de exemplo e ainda não vêm do banco: "
        "os casos de uso da Fase 1 ainda não estão ligados.",
        icon=":material/science:",
    )


# ------------------------------------------------------------------ diálogo Lançar


def botao_lancar(chave: str) -> None:
    """Ação principal do app: abre o lançamento rápido em qualquer página."""
    if st.button(
        "Lançar",
        icon=":material/add:",
        type="primary",
        key=chave,
        width="content",
        help="Gastei, recebi, guardei ou paguei a fatura",
    ):
        dialogo_lancar()


def tabela(
    linhas: list[dict[str, object]], *, a_direita: tuple[str, ...] = (), altura: int | None = None
) -> None:
    """Tabela somente leitura. Colunas de dinheiro vão à direita, como em extrato."""
    configuracao = {
        coluna: st.column_config.TextColumn(coluna, alignment="right") for coluna in a_direita
    }
    # `height` não aceita None nas sobrecargas do Streamlit: ou se passa um
    # número, ou não se passa.
    if altura is None:
        st.dataframe(linhas, hide_index=True, width="stretch", column_config=configuracao)
    else:
        st.dataframe(
            linhas, hide_index=True, width="stretch", column_config=configuracao, height=altura
        )
