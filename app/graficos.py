"""Gráficos do app (RF22): um por pergunta, num lugar só.

Regras (brief v2, revisão de 2026-10-29):
- Altair com `theme="streamlit"`: as cores vêm do `chartCategoricalColors` do
  config.toml, que espelha `--fin-grafico-cat-1..6`. A ordem do `domain` decide a
  cor; nenhuma página escolhe cor.
- Nada de legenda quando dá para escrever o nome no fim da série (melhor no
  celular). Valores em formato brasileiro (R$ 1.234; 9,5%).
- `Decimal` vira `float` só aqui, na entrega ao gráfico (ADR-012).
- Pizza continua proibida.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from typing import Any

import altair as alt
import streamlit as st

# Rótulos de eixo em pt-BR sem depender de locale do Vega.
EIXO_BRL = (
    "'R$ ' + replace(replace(replace(format(datum.value, ',.0f'), ',', '#'), '.', ','), '#', '.')"
)
EIXO_PCT = "replace(format(datum.value, '.0f'), '.', ',') + '%'"


def _f(valor: Decimal) -> float:
    return float(valor)


def _dados(valores: list[dict[str, Any]]) -> Any:
    """`alt.Data` não tem anotação de tipos no Altair 6; o ignore fica só aqui."""
    return alt.Data(values=valores)  # type: ignore[no-untyped-call]


def _eixo_mes(meses: Sequence[str]) -> alt.X:
    """Meses em ordem, rótulo na horizontal, sumindo os que se sobrepõem no celular."""
    return alt.X(
        "mes:O", sort=list(meses), title=None, axis=alt.Axis(labelAngle=0, labelOverlap="greedy")
    )


def _mostrar(grafico: alt.TopLevelMixin, altura: int) -> None:
    st.altair_chart(
        grafico.properties(height=altura).configure_view(stroke=None),
        theme="streamlit",
        width="stretch",
    )


def linhas_com_rotulo(
    meses: Sequence[str],
    series: dict[str, Sequence[Decimal]],
    *,
    eixo: str = EIXO_PCT,
    formato_fim: str = "pct",
    altura: int = 240,
) -> None:
    """Várias séries no tempo, cada uma com nome e último valor escritos no fim."""
    nomes = list(series)
    valores: list[dict[str, Any]] = [
        {"mes": m, "ordem": i, "serie": nome, "valor": _f(v)}
        for nome, pontos in series.items()
        for i, (m, v) in enumerate(zip(meses, pontos, strict=True))
    ]
    ultimo = len(meses) - 1
    texto_fim = (
        "datum.serie + ' ' + replace(format(datum.valor, '.1f'), '.', ',') + '%'"
        if formato_fim == "pct"
        else EIXO_BRL.replace("datum.value", "datum.valor")
    )
    base = alt.Chart(_dados(valores)).encode(
        x=_eixo_mes(meses),
        y=alt.Y("valor:Q", title=None, axis=alt.Axis(labelExpr=eixo, tickCount=4)),
        color=alt.Color("serie:N", scale=alt.Scale(domain=nomes), legend=None),
    )
    linha = base.mark_line(strokeWidth=2.5, interpolate="monotone")
    ponto = base.transform_filter(f"datum.ordem == {ultimo}").mark_circle(size=60)
    rotulo = (
        base.transform_filter(f"datum.ordem == {ultimo}")
        .transform_calculate(texto=texto_fim)
        .mark_text(align="left", dx=8, fontWeight=600)
        .encode(text="texto:N")
    )
    dica = base.mark_point(opacity=0, size=200).encode(
        tooltip=[
            alt.Tooltip("serie:N", title="Série"),
            alt.Tooltip("mes:O", title="Mês"),
            alt.Tooltip("valor:Q", title="Valor", format=".2f"),
        ]
    )
    # Margem à direita para o rótulo do fim ("Carteira 11,1%") não cobrir as linhas.
    _mostrar((linha + ponto + rotulo + dica).properties(padding={"right": 96}), altura)


def barras_empilhadas(
    meses: Sequence[str],
    por_grupo: dict[str, Sequence[Decimal]],
    *,
    altura: int = 260,
) -> None:
    """Composição no tempo (soma = total). Legenda embaixo, em linha."""
    grupos = list(por_grupo)
    valores: list[dict[str, Any]] = [
        {"mes": m, "grupo": g, "valor": _f(v)}
        for g, pontos in por_grupo.items()
        for m, v in zip(meses, pontos, strict=True)
    ]
    grafico = (
        alt.Chart(_dados(valores))
        .mark_bar(cornerRadiusTopLeft=2, cornerRadiusTopRight=2)
        .encode(
            x=_eixo_mes(meses),
            y=alt.Y("sum(valor):Q", title=None, axis=alt.Axis(labelExpr=EIXO_BRL, tickCount=4)),
            color=alt.Color(
                "grupo:N",
                scale=alt.Scale(domain=grupos),
                legend=alt.Legend(orient="bottom", title=None, direction="horizontal", columns=3),
            ),
            order=alt.Order("grupo_ordem:Q"),
            tooltip=[
                alt.Tooltip("mes:O", title="Mês"),
                alt.Tooltip("grupo:N", title="Classe"),
                alt.Tooltip("valor:Q", title="R$", format=",.2f"),
            ],
        )
        .transform_calculate(grupo_ordem=f"indexof({grupos!r}, datum.grupo)")
    )
    _mostrar(grafico, altura)


def barras_com_destaque(
    meses: Sequence[str],
    valores: Sequence[Decimal],
    *,
    destaque: int | None = None,
    altura: int = 200,
) -> None:
    """Uma série por mês; o mês em destaque na cor do acento, os outros apagados."""
    alvo = len(meses) - 1 if destaque is None else destaque
    dados: list[dict[str, Any]] = [
        {
            "mes": m,
            "valor": _f(v),
            "atual": i == alvo,
            "texto": "R$ " + f"{v:,.0f}".replace(",", "."),
        }
        for i, (m, v) in enumerate(zip(meses, valores, strict=True))
    ]
    base = alt.Chart(_dados(dados)).encode(
        x=_eixo_mes(meses),
        y=alt.Y("valor:Q", title=None, axis=None),
    )
    barras = base.mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        opacity=alt.condition("datum.atual", alt.value(1.0), alt.value(0.35)),
        tooltip=[alt.Tooltip("mes:O", title="Mês"), alt.Tooltip("texto:N", title="Valor")],
    )
    rotulo = (
        base.transform_filter("datum.atual").mark_text(dy=-8, fontWeight=600).encode(text="texto:N")
    )
    _mostrar(barras + rotulo, altura)


def alocacao_contra_meta(
    linhas: Sequence[tuple[str, Decimal, Decimal]],
    *,
    altura: int | None = None,
) -> None:
    """Barra horizontal por classe (% atual) com a meta marcada por um traço."""
    classes = [c for c, _, _ in linhas]
    dados: list[dict[str, Any]] = [
        {
            "classe": c,
            "atual": _f(a),
            "meta": _f(m),
            "texto": f"{a:.0f}% · meta {m:.0f}%",
        }
        for c, a, m in linhas
    ]
    base = alt.Chart(_dados(dados)).encode(
        y=alt.Y("classe:N", sort=classes, title=None, axis=alt.Axis(labelLimit=110)),
    )
    # Folga à direita para o texto "28% · meta 30%" caber depois da barra.
    teto = max(max(d["atual"] for d in dados), max(d["meta"] for d in dados)) * 1.45
    barras = base.mark_bar(cornerRadiusEnd=3, height=18).encode(
        x=alt.X("atual:Q", title=None, axis=None, scale=alt.Scale(domain=[0, teto])),
        color=alt.Color("classe:N", scale=alt.Scale(domain=classes), legend=None),
    )
    meta = base.mark_tick(thickness=2, size=26, color="#888").encode(x="meta:Q")
    texto = (
        base.mark_text(align="left", dx=6, fontSize=12)
        .encode(x=alt.X("max_val:Q"), text="texto:N")
        .transform_calculate(max_val="max(datum.atual, datum.meta)")
    )
    _mostrar(barras + meta + texto, altura or 44 * len(dados))


def projecao_com_faixa(
    meses: Sequence[int],
    central: Sequence[Decimal],
    baixo: Sequence[Decimal],
    alto: Sequence[Decimal],
    *,
    altura: int = 240,
) -> None:
    """Linha central com a faixa entre o cenário baixo e o alto."""
    dados: list[dict[str, Any]] = [
        {"mes": m, "central": _f(c), "baixo": _f(b), "alto": _f(a)}
        for m, c, b, a in zip(meses, central, baixo, alto, strict=True)
    ]
    base = alt.Chart(_dados(dados)).encode(
        x=alt.X("mes:Q", title="meses a partir de hoje", axis=alt.Axis(tickCount=6)),
    )
    faixa = base.mark_area(opacity=0.18).encode(
        y=alt.Y("baixo:Q", title=None, axis=alt.Axis(labelExpr=EIXO_BRL, tickCount=4)),
        y2="alto:Q",
    )
    linha = base.mark_line(strokeWidth=2.5).encode(y="central:Q")
    _mostrar(faixa + linha, altura)
