"""Página "Orçamento": previsto x realizado por categoria, e quanto foi guardado.

Casos de uso a ligar: `budgeting.orcamento_do_mes`, `budgeting.modelo_de_previsto`
(novo: substitui "copiar mês anterior"), `goals.guardado_do_mes`.

Regras da tela (decisões do grill de 2026-10-08):
- gasto e guardado aparecem separados; aporte é transferência;
- previsto = modelo recorrente por categoria + ajuste só nos meses que fogem;
- renda acima da base aparece à parte, como "acima do previsto".
"""

from decimal import Decimal
from itertools import groupby

import streamlit as st

from app import dados
from app.componentes import linha_de_orcamento, metrica, seletor_de_mes
from app.composicao import sessao_atual
from app.formatacao import brl
from app.layout import cabecalho, titulo
from app.modelos import estado_do_gasto

cabecalho(sessao_atual())
titulo("Orçamento")

mes = seletor_de_mes("mes_orcamento")
resumo = dados.resumo_do_mes(mes)

topo = st.columns(4)
with topo[0]:
    metrica("Renda base", resumo.renda_base)
with topo[1]:
    metrica(
        "Gasto",
        resumo.gasto,
        detalhe=f"Previsto {brl(resumo.gasto_previsto)}",
        estado=estado_do_gasto(resumo.gasto, resumo.gasto_previsto),
    )
with topo[2]:
    metrica("Guardado", resumo.guardado, detalhe=f"Planejado {brl(resumo.guardado_previsto)}")
with topo[3]:
    metrica("Sobra", resumo.sobra, detalhe="Renda - gasto - guardado")

if resumo.renda_acima_do_previsto > 0:
    st.info(
        f"**{brl(resumo.renda_acima_do_previsto)} acima do previsto** na renda deste mês. "
        "Você decide para onde vai: guardar, investir ou gastar.",
        icon=":material/trending_up:",
    )

aba_gasto, aba_guardado, aba_previsto = st.tabs(["Gasto", "Guardado", "Previsto"])

with aba_gasto:
    linhas = dados.orcamento_do_mes(mes)
    for grupo, itens in groupby(linhas, key=lambda linha: linha.grupo):
        lista = list(itens)
        total = sum((i.realizado - i.financiado_por_cofrinho for i in lista), Decimal(0))
        previsto = sum((i.previsto for i in lista), Decimal(0))
        with st.container(border=True):
            st.markdown(f"**{grupo}**  \n:gray[{brl(total)} de {brl(previsto)}]")
            st.html("".join(linha_de_orcamento(i) for i in lista))
    st.caption(
        "Despesas pagas com dinheiro de cofrinho aparecem no consumo da categoria, "
        "mas não contam no gasto corrente do mês."
    )

with aba_guardado:
    st.caption("Transferido para reserva, cofrinhos e investimentos. Não é gasto.")
    for meta in dados.metas_de_guardado(mes):
        with st.container(border=True):
            esquerda, direita = st.columns([2, 1])
            esquerda.markdown(f"**{meta.destino}**")
            direita.markdown(f"{brl(meta.transferido)} de {brl(meta.planejado)}")
            st.progress(
                float(min(meta.transferido / meta.planejado, Decimal(1))) if meta.planejado else 0.0
            )
            if meta.devolucao > 0:
                st.caption(
                    f"Mais {brl(meta.devolucao)} devolvidos a este cofrinho: "
                    "recompõem o que já estava guardado e não contam como guardado novo."
                )

with aba_previsto:
    st.caption(
        "O previsto é um modelo que se repete todo mês. Preencha 'Ajuste deste mês' só "
        "nos meses que fogem do padrão."
    )
    editado = st.data_editor(
        [
            {
                "Categoria": item.categoria,
                "Padrão": brl(item.padrao),
                "Ajuste deste mês": brl(item.ajuste_do_mes) if item.ajuste_do_mes else "",
            }
            for item in dados.modelo_de_previsto(mes)
        ],
        hide_index=True,
        width="stretch",
        disabled=("Categoria",),
        key="editor_previsto",
    )
    if st.button("Salvar previsto", key="salvar_previsto"):
        # TODO(claude-code): budgeting.application.salvar_previsto. Ler os valores com
        # `app.formatacao.ler_valor` (nunca float) e gravar o padrão no modelo recorrente
        # e os ajustes em `budgets` para este mês.
        st.toast("Exemplo: nada foi gravado. Falta ligar budgeting.salvar_previsto.")
