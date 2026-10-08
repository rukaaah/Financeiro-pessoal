"""Página "Lançamentos": lista filtrável de receitas, despesas e transferências.

Casos de uso a ligar: `ledger.listar_lancamentos` (filtros e paginação).
Edição de lançamento e exportação em CSV (Fase 3) ainda não existem.
"""

import streamlit as st

from app import dados
from app.componentes import seletor_de_mes, tabela
from app.composicao import sessao_atual
from app.formatacao import brl, data_curta, mes_numerico
from app.layout import cabecalho, titulo
from app.modelos import TipoDeLancamento

TODOS = "Todos"

cabecalho(sessao_atual())
titulo("Lançamentos")

mes = seletor_de_mes("mes_lancamentos")
lancamentos = dados.lancamentos_do_mes(mes)

with st.popover("Filtros", icon=":material/filter_list:", width="stretch"):
    tipo = st.pills("Tipo", [TODOS, *(t.value for t in TipoDeLancamento)], default=TODOS)
    contas = st.multiselect("Conta", sorted({lancamento.conta for lancamento in lancamentos}))
    categorias = st.multiselect(
        "Categoria", sorted({lan.categoria for lan in lancamentos if lan.categoria})
    )
    busca = st.text_input("Buscar na descrição")

filtrados = [
    lan
    for lan in lancamentos
    if (tipo in (None, TODOS) or lan.tipo.value == tipo)
    and (not contas or lan.conta in contas)
    and (not categorias or lan.categoria in categorias)
    and (not busca or busca.lower() in lan.descricao.lower())
]

st.caption(f"{len(filtrados)} lançamentos")
tabela(
    [
        {
            "Data": data_curta(lan.data),
            "Descrição": lan.descricao + (f" ({lan.parcela})" if lan.parcela else ""),
            "Categoria": lan.categoria or "Transferência",
            "Conta": lan.conta,
            "Fatura": mes_numerico(lan.mes_da_fatura) if lan.mes_da_fatura else "",
            "Cofrinho": lan.financiado_por or "",
            "Valor": brl(lan.valor, com_sinal=True),
        }
        for lan in filtrados
    ],
    a_direita=("Valor",),
    altura=480,
)
st.caption(
    "Compra no cartão entra no orçamento do mês da fatura, não no da compra. "
    "Transferências ficam fora do gasto."
)

with st.expander("Em breve"):
    # TODO(claude-code): edição de lançamento (ledger.atualizar_lancamento) e exportação
    # em CSV (Fase 3, RF13). Hoje a tabela é só leitura.
    st.button("Exportar CSV", disabled=True, help="Fase 3 (RF13)")
