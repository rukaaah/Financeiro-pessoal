"""Página "Visão geral": a resposta do mês — quanto sobra, quanto gastei, quanto guardei.

Dados: `app.dados`. Casos de uso a ligar (ver TODO(claude-code) lá):
`budgeting.resumo_do_mes`, `cards.faturas_do_cartao`, `ledger.saldo_por_conta`,
patrimônio mês a mês.
"""

from html import escape

import streamlit as st

from app import dados
from app.componentes import barra, metrica, seletor_de_mes, tabela
from app.composicao import sessao_atual
from app.formatacao import brl, mes_numerico, percentual
from app.layout import cabecalho, titulo
from app.modelos import SituacaoDaFatura, TipoDeConta, estado_do_gasto

cabecalho(sessao_atual())
titulo("Visão geral")

mes = seletor_de_mes("mes_visao_geral")
resumo = dados.resumo_do_mes(mes)

# A resposta que decide: o que sobrou depois de gastar e de guardar.
with st.container(border=True):
    st.metric(
        "Sobra do mês",
        brl(resumo.sobra),
        help="Renda do mês menos o que foi gasto e o que foi guardado. "
        "Aportes e reservas são transferências: entram em 'Guardado', não em 'Gasto'.",
    )
    st.caption(
        f"Renda {brl(resumo.renda_real)}  -  gasto {brl(resumo.gasto)}  -  "
        f"guardado {brl(resumo.guardado)}"
    )

esquerda, centro, direita = st.columns(3)
with esquerda:
    metrica(
        "Gasto",
        resumo.gasto,
        detalhe=f"Previsto {brl(resumo.gasto_previsto)}",
        estado=estado_do_gasto(resumo.gasto, resumo.gasto_previsto),
    )
    st.html(barra(resumo.gasto, resumo.gasto_previsto))
with centro:
    metrica(
        "Guardado",
        resumo.guardado,
        detalhe=f"Planejado {brl(resumo.guardado_previsto)}",
        ajuda="Aportes em cofrinhos, reserva e investimentos. Devolução de empréstimo "
        "a cofrinho não conta como guardado novo.",
    )
with direita:
    acima = resumo.renda_acima_do_previsto
    metrica(
        "Renda",
        resumo.renda_real,
        detalhe=(
            f"Base {brl(resumo.renda_base)}"
            + (f"  +  {brl(acima)} acima do previsto" if acima > 0 else "")
        ),
    )

col_poupanca, col_fatura = st.columns(2)
with col_poupanca, st.container(border=True):
    st.metric("Taxa de poupança", percentual(resumo.taxa_de_poupanca))
    st.caption("(receitas - despesas) / receitas")
with col_fatura:
    fatura_aberta = next(
        (f for f in dados.faturas("Unicred") if f.situacao is SituacaoDaFatura.ABERTA), None
    )
    with st.container(border=True):
        if fatura_aberta is None:
            st.metric("Fatura aberta", "-")
        else:
            st.metric("Fatura aberta", brl(fatura_aberta.total))
            st.caption(
                f"{fatura_aberta.cartao}, vence em {mes_numerico(fatura_aberta.mes_de_vencimento)}"
            )

st.subheader("Atenção neste mês")
acima_do_previsto = sorted(
    (linha for linha in dados.orcamento_do_mes(mes) if linha.estado.value != "ok"),
    key=lambda linha: linha.realizado - linha.previsto,
    reverse=True,
)[:3]
if not acima_do_previsto:
    st.caption("Nenhuma categoria perto do limite.")
for linha in acima_do_previsto:
    st.html(
        '<div class="fin-linha__topo">'
        f'<span class="fin-linha__nome">{escape(linha.categoria)}</span>'
        f'<span class="fin-valor">{brl(linha.realizado)} de {brl(linha.previsto)}</span></div>'
    )

st.subheader("Saldo por conta")
tabela(
    [
        {"Conta": c.nome, "Tipo": c.tipo.value, "Saldo": brl(c.saldo)}
        for c in dados.contas()
        if c.tipo is not TipoDeConta.A_RECEBER
    ],
    a_direita=("Saldo",),
)

st.subheader("Patrimônio mês a mês")
serie = dados.patrimonio_mensal(mes)
# `float` só aqui, e só para desenhar: o gráfico não faz conta nem guarda valor.
st.line_chart(
    {"Mês": [ponto for ponto, _ in serie], "Patrimônio": [float(v) for _, v in serie]},
    x="Mês",
    y="Patrimônio",
    y_label="R$",
)
