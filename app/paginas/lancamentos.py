"""Lançamentos: o extrato do mês, como lista de app e não como planilha.

Revisão de 2026-10-29 (o Pedro viu a v1: "mega extenso", "repetição e
padronização de tabela"): lista agrupada por dia com o total do dia, ícone
colorido da categoria, transferência numa linha só ("PicPay → Reserva"), e
ordenar por valor responde "qual foi meu maior gasto".

Casos de uso a ligar: `ledger.listar_lancamentos` (filtros e paginação).
Edição de lançamento e exportação em CSV (Fase 3) ainda não existem.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

import streamlit as st

from app import dados
from app.blocos import Grupo, ItemDaRegua, Linha, Tom, icone_do_grupo, lista, regua
from app.formatacao import brl, mes_numerico
from app.layout import titulo_com_mes
from app.modelos import Lancamento, TipoDeLancamento

DIAS_DA_SEMANA = ("seg", "ter", "qua", "qui", "sex", "sáb", "dom")
MESES_CURTOS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

# Quantos aparecem antes de "Mostrar todos": o bastante para a semana, sem virar
# a página inteira (revisão de 2026-10-29: "mega extenso").
PRIMEIROS = 8

TIPOS = {
    "Tudo": None,
    "Gastos": TipoDeLancamento.DESPESA,
    "Entradas": TipoDeLancamento.RECEITA,
    "Transferências": TipoDeLancamento.TRANSFERENCIA,
}


def _dia(data: date) -> str:
    return f"{DIAS_DA_SEMANA[data.weekday()]}, {data.day} de {MESES_CURTOS[data.month - 1]}"


def _uma_linha_por_transferencia(lancamentos: tuple[Lancamento, ...]) -> list[Lancamento]:
    """A transferência tem duas pernas no banco; na tela, uma linha com origem → destino."""
    destinos = {
        (lan.data, lan.descricao): lan.conta
        for lan in lancamentos
        if lan.tipo is TipoDeLancamento.TRANSFERENCIA and lan.valor > 0
    }
    resultado = []
    for lan in lancamentos:
        if lan.tipo is not TipoDeLancamento.TRANSFERENCIA:
            resultado.append(lan)
        elif lan.valor < 0:
            destino = destinos.get((lan.data, lan.descricao), "?")
            resultado.append(
                Lancamento(
                    data=lan.data,
                    descricao=lan.descricao,
                    tipo=lan.tipo,
                    conta=f"{lan.conta} → {destino.removeprefix('A receber: ')}",
                    categoria=None,
                    valor=-lan.valor,
                )
            )
    return resultado


def _linha(lan: Lancamento, grupo_da_categoria: dict[str, str]) -> Linha:
    tom: Tom
    if lan.tipo is TipoDeLancamento.TRANSFERENCIA:
        icone, cor, tom = "swap_horiz", 6, "neutro"
        detalhe = lan.conta
        valor = brl(lan.valor)
    else:
        icone, cor = icone_do_grupo(grupo_da_categoria.get(lan.categoria or ""))
        partes = [lan.categoria or "", lan.conta]
        if lan.parcela:
            partes.append(f"parcela {lan.parcela}")
        if lan.mes_da_fatura:
            partes.append(f"fatura {mes_numerico(lan.mes_da_fatura)}")
        if lan.financiado_por:
            partes.append(f"pago com {lan.financiado_por}")
        detalhe = " · ".join(p for p in partes if p)
        tom = "positivo" if lan.valor > 0 else "neutro"
        valor = brl(lan.valor, com_sinal=True)
    return Linha(lan.descricao, valor, detalhe, icone=icone, cor=cor, tom=tom)


mes = titulo_com_mes("Lançamentos")

todos = _uma_linha_por_transferencia(dados.lancamentos_do_mes(mes))
grupo_da_categoria = {c.nome: c.grupo for c in dados.categorias_configuradas()}

entrou = sum((lan.valor for lan in todos if lan.tipo is TipoDeLancamento.RECEITA), Decimal(0))
saiu = -sum((lan.valor for lan in todos if lan.tipo is TipoDeLancamento.DESPESA), Decimal(0))
st.html(
    regua(
        (
            ItemDaRegua("Entrou", brl(entrou), "", "positivo"),
            ItemDaRegua("Saiu", brl(saiu), "gastos, sem transferências", "negativo"),
            ItemDaRegua(
                "Saldo do mês",
                brl(entrou - saiu, com_sinal=True),
                "",
                "positivo" if entrou >= saiu else "negativo",
            ),
        )
    )
)

with st.container(horizontal=True, vertical_alignment="center", gap="small", key="fin-filtros"):
    escolha = st.segmented_control(
        "Tipo", list(TIPOS), default="Tudo", label_visibility="collapsed", key="tipo_lanc"
    )
    ordem = st.segmented_control(
        "Ordenar",
        ["Data", "Maior valor"],
        default="Data",
        label_visibility="collapsed",
        key="ordem_lanc",
    )
    with st.popover("Buscar", icon=":material/search:"):
        busca = st.text_input("Buscar na descrição", key="busca_lanc")
        contas = st.multiselect("Conta", sorted({lan.conta for lan in todos}), key="contas_lanc")

tipo = TIPOS.get(escolha or "Tudo")
filtrados = [
    lan
    for lan in todos
    if (tipo is None or lan.tipo is tipo)
    and (not busca or busca.lower() in lan.descricao.lower())
    and (not contas or lan.conta in contas)
]

mostrar_todos = st.session_state.get("lanc_todos", False) or bool(busca)
ocultos = 0 if mostrar_todos else max(len(filtrados) - PRIMEIROS, 0)

if not filtrados:
    st.html('<p class="fin-legenda">Nenhum lançamento com esses filtros neste mês.</p>')
elif ordem == "Maior valor":
    ordenados = sorted(filtrados, key=lambda lan: abs(lan.valor), reverse=True)
    ordenados = ordenados[: len(ordenados) - ocultos]
    st.html(
        lista(
            [
                Grupo(
                    [_linha(lan, grupo_da_categoria) for lan in ordenados],
                    f"{len(ordenados)} lançamentos, do maior para o menor",
                )
            ]
        )
    )
else:
    por_dia: dict[date, list[Lancamento]] = defaultdict(list)
    for lan in filtrados[: len(filtrados) - ocultos]:
        por_dia[lan.data].append(lan)
    grupos = []
    for dia in sorted(por_dia, reverse=True):
        do_dia = por_dia[dia]
        total = sum(
            (lan.valor for lan in do_dia if lan.tipo is not TipoDeLancamento.TRANSFERENCIA),
            Decimal(0),
        )
        grupos.append(
            Grupo(
                [_linha(lan, grupo_da_categoria) for lan in do_dia],
                _dia(dia),
                # Total só quando soma algo: com um lançamento ele repete a linha.
                brl(total, com_sinal=True) if total and len(do_dia) > 1 else "",
            )
        )
    st.html(lista(grupos))

if ocultos:
    st.button(
        f"Mostrar todos ({len(filtrados)})",
        icon=":material/expand_more:",
        width="stretch",
        on_click=lambda: st.session_state.update(lanc_todos=True),
    )

st.caption(
    "Compra no cartão entra no orçamento do mês da fatura, não no da compra. "
    "Transferência não é gasto."
)
# TODO(claude-code): edição de lançamento (ledger.atualizar_lancamento), exportação em
# CSV (Fase 3, RF13) e "Importar extrato" como diálogo daqui.
