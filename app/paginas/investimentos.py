"""Página "Investimentos": carteira, proventos previstos, comparativo, projeção e renda fixa.

Casos de uso a ligar: `investments.carteira`, `investments.renda_fixa`,
`investments.projetar_renda` (hoje `dados.projetar`), `market_data.situacao_das_fontes`.

Os dados externos chegam por job agendado (GitHub Actions) que raspa o Investidor10
e lê BCB e Tesouro Transparente; a tela lê do banco, nunca da web, e mostra o último
dado com a data se uma fonte falhar. Esta tela mostra posição, proventos e projeção;
não recomenda compra: a análise continua fora do sistema.
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.componentes import metrica, tabela
from app.composicao import sessao_atual
from app.formatacao import brl, data_curta, ler_valor, percentual
from app.layout import cabecalho, titulo
from app.modelos import PremissasDeProjecao

cabecalho(sessao_atual())
titulo("Investimentos")

fiis = dados.fiis()
fontes = dados.fontes_de_dados()

with st.expander("Fontes dos dados"):
    for fonte in fontes:
        quando = data_curta(fonte.lido_em) if fonte.lido_em else "nunca"
        estado = "ok" if fonte.ok else "falhou: mostrando o último dado"
        st.caption(f"{fonte.nome}: lido em {quando}, {estado}")
    # TODO(claude-code): botão "Atualizar agora" não existe de propósito. O job agendado
    # grava no banco (1 requisição por ticker, só tickers em carteira, com pausa).
    st.button("Atualizar agora", disabled=True, help="Quem atualiza é o job agendado.")

total_fiis = sum((f.valor_de_mercado for f in fiis), Decimal(0))
custo_fiis = sum((f.custo for f in fiis), Decimal(0))
proventos = sum((f.provento_do_mes for f in fiis), Decimal(0))
topo = st.columns(3)
with topo[0]:
    metrica("Valor de mercado (FIIs)", total_fiis)
with topo[1]:
    metrica(
        "Rentabilidade sobre o custo",
        total_fiis - custo_fiis,
        detalhe=percentual((total_fiis - custo_fiis) / custo_fiis * 100) if custo_fiis else None,
    )
with topo[2]:
    metrica("Proventos previstos no mês", proventos)

aba_carteira, aba_proventos, aba_comparativo, aba_projecao, aba_renda_fixa = st.tabs(
    ["Carteira", "Proventos", "Comparativo", "Projeção", "Renda fixa"]
)

with aba_carteira:
    tabela(
        [
            {
                "Ativo": f.ticker,
                "Cotas": f.cotas,
                "Preço": brl(f.preco),
                "Preço médio": brl(f.preco_medio),
                "Valor": brl(f.valor_de_mercado),
                "Rentab.": percentual((f.preco / f.preco_medio - 1) * 100),
            }
            for f in fiis
        ],
        a_direita=("Preço", "Preço médio", "Valor", "Rentab."),
    )
    st.bar_chart(
        {"Ativo": [f.ticker for f in fiis], "Valor": [float(f.valor_de_mercado) for f in fiis]},
        x="Ativo",
        y="Valor",
        y_label="R$",
        height=220,
    )

with aba_proventos:
    st.caption(
        "Cotas x valor anunciado. Antes do anúncio, a média dos últimos 12 proventos, "
        "marcado como estimado."
    )
    tabela(
        [
            {
                "Ativo": f.ticker,
                "Cotas": f.cotas,
                "Por cota": brl(f.provento_por_cota),
                "Total": brl(f.provento_do_mes),
                "Situação": "estimado" if f.provento_estimado else "anunciado",
            }
            for f in fiis
        ],
        a_direita=("Por cota", "Total"),
    )

with aba_comparativo:
    st.caption(
        "Indicadores lidos do Investidor10. Para decidir o próximo aporte; não é recomendação."
    )
    tabela(
        [
            {
                "Ativo": f.ticker,
                "Dividend yield 12m": percentual(f.dy_12m),
                "P/VP": f"{f.p_vp:.2f}".replace(".", ","),
                "Valorização no mês": percentual(f.valorizacao_no_mes, 1),
                "Preço": brl(f.preco),
                "Lido em": data_curta(f.lido_em),
            }
            for f in fiis
        ],
        a_direita=("Dividend yield 12m", "P/VP", "Valorização no mês", "Preço"),
    )

with aba_projecao:
    padrao = dados.premissas_padrao()
    st.caption(
        "Uma conta com as premissas abaixo, não uma previsão de mercado. Mude e veja o efeito."
    )
    colunas = st.columns(2)
    texto_aporte = colunas[0].text_input(
        "Aporte mensal (R$)",
        value=f"{padrao.aporte_mensal:.2f}".replace(".", ","),
        key="proj_aporte",
    )
    reinvestir = colunas[1].toggle("Reinvestir proventos", value=padrao.reinvestir_proventos)
    dy_anual = colunas[0].slider("Dividend yield anual (%)", 0.0, 20.0, float(padrao.dy_anual), 0.1)
    valorizacao = colunas[1].slider(
        "Valorização anual das cotas (%)", -5.0, 15.0, float(padrao.valorizacao_anual), 0.1
    )
    horizonte = st.select_slider("Horizonte (meses)", options=[6, 12, 24, 36, 60], value=24)

    aporte = ler_valor(texto_aporte)
    if aporte is None:
        st.error("Informe um aporte maior que zero, como 650,00.")
    else:
        premissas = PremissasDeProjecao(
            aporte, Decimal(str(dy_anual)), Decimal(str(valorizacao)), reinvestir
        )
        pontos = dados.projetar(premissas, horizonte)
        marcos = [p for p in pontos if p.meses in (6, 12, 24, horizonte)]
        tabela(
            [
                {
                    "Em": f"{p.meses} meses",
                    "Patrimônio": brl(p.patrimonio),
                    "Renda mensal": brl(p.renda_mensal),
                }
                for p in dict.fromkeys(marcos)
            ],
            a_direita=("Patrimônio", "Renda mensal"),
        )
        st.line_chart(
            {
                "Mês": [p.meses for p in pontos],
                "Renda mensal": [float(p.renda_mensal) for p in pontos],
            },
            x="Mês",
            y="Renda mensal",
            y_label="R$",
            height=220,
        )

with aba_renda_fixa:
    st.caption("CDBs são cofrinhos que rendem por % do CDI. O CDI abaixo é um valor de exemplo.")
    cdi = dados.taxa_cdi_de_exemplo()
    st.caption(f"CDI anual (exemplo): {percentual(cdi, 2)}")
    tabela(
        [
            {
                "Ativo": r.nome,
                "Saldo": brl(r.saldo),
                "Rende": f"{percentual(r.percentual_do_cdi, 0)} do CDI"
                if r.percentual_do_cdi is not None
                else "Taxa Selic",
                "Rendimento anual estimado": brl(
                    r.saldo * (cdi / 100) * ((r.percentual_do_cdi or Decimal(100)) / 100)
                ),
            }
            for r in dados.renda_fixa()
        ],
        a_direita=("Saldo", "Rendimento anual estimado"),
    )
