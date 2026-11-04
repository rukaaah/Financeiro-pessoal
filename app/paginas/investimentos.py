"""Investimentos: a carteira como um rastreador mostra, e onde aportar pelas suas regras.

Revisão de 2026-10-29: o Pedro achou a v1 "ridiculamente pouco específica" e
pediu a referência de apps que rastreiam carteira (Investidor10, Kinvo). Cinco
abas: Resumo, Carteira, Proventos, Onde aportar, Projeção.

Tudo sobre dados de exemplo (`app.carteira`), com tickers que não existem na B3.
Os dados reais chegam por job agendado (Investidor10, BCB, Tesouro
Transparente); a tela lê do banco, nunca da web.
"""

from datetime import date
from decimal import Decimal

import streamlit as st

from app import carteira as cart
from app import dados, graficos
from app.blocos import (
    Barra,
    Grupo,
    ItemDaRegua,
    Linha,
    barras,
    colunas,
    destaque,
    lista,
    quadro,
    regua,
    secao,
)
from app.formatacao import brl, data_curta, ler_valor, mes_curto
from app.layout import titulo

COR_DA_CLASSE = {classe: i + 1 for i, classe in enumerate(cart.CLASSES)}
ICONE_DA_CLASSE = {
    "Papel": "description",
    "Tijolo": "apartment",
    "Logística": "local_shipping",
    "FI-Infra": "bolt",
    "Renda fixa": "account_balance",
}


def _pct(valor: Decimal, sinal: bool = True) -> str:
    texto = f"{abs(valor):.1f}".replace(".", ",") + "%"
    if not sinal:
        return texto
    return ("+" if valor > 0 else "-" if valor < 0 else "") + texto


titulo("Investimentos")

ativos = cart.ativos()
historico = cart.historico()
meta = cart.metas()
meses = [mes_curto(m.mes) for m in historico]
patrimonio = sum((a.valor for a in ativos), Decimal(0))
por_classe = {c: sum((a.valor for a in ativos if a.classe == c), Decimal(0)) for c in cart.CLASSES}

aba_resumo, aba_carteira, aba_proventos, aba_aporte, aba_projecao = st.tabs(
    ["Resumo", "Carteira", "Proventos", "Onde aportar", "Projeção"]
)

# ----------------------------------------------------------------------------- Resumo
with aba_resumo:
    anterior = historico[-2].patrimonio
    variacao = patrimonio - anterior
    renda_mes = sum((a.provento_do_mes for a in ativos), Decimal(0))
    media_12 = sum((m.proventos for m in historico), Decimal(0)) / len(historico)
    ultimo = historico[-1]
    numeros = regua(
        (
            ItemDaRegua("Renda passiva no mês", brl(renda_mes), "proventos previstos", "positivo"),
            ItemDaRegua("Média em 12 meses", brl(media_12), "por mês"),
            ItemDaRegua(
                "Rentabilidade 12m",
                _pct(ultimo.carteira_pct),
                f"CDI {_pct(ultimo.cdi_pct, False)} · IFIX {_pct(ultimo.ifix_pct, False)}",
                "positivo" if ultimo.carteira_pct >= ultimo.cdi_pct else "perto",
            ),
        )
    )
    # Próxima marca no ritmo atual: aporte médio + proventos reinvestidos.
    marca = Decimal(10_000) * ((patrimonio // Decimal(10_000)) + 1)
    if patrimonio >= Decimal(50_000):
        marca = Decimal(100_000) * ((patrimonio // Decimal(100_000)) + 1)
    aporte_medio = (historico[-1].aportado - historico[0].aportado) / (len(historico) - 1)
    valor_projetado, meses_ate = patrimonio, 0
    while valor_projetado < marca and meses_ate < 600:
        valor_projetado += aporte_medio + valor_projetado * Decimal("0.0075")
        meses_ate += 1
    rumo = barras((Barra(f"Até {brl(marca)}", float(patrimonio / marca), f"~{meses_ate} meses"),))
    principal = destaque(
        "Patrimônio investido",
        brl(patrimonio),
        f"{brl(variacao, com_sinal=True)} no mês ({_pct(variacao / anterior * 100)})",
        "positivo" if variacao >= 0 else "negativo",
        numeros,
        corpo=rumo
        + '<p class="fin-legenda">'
        + f"No ritmo atual: aporte médio de {brl(aporte_medio)}/mês e 0,75% ao mês.</p>",
    )
    # Ao lado do número: de que ele é feito (revisão de 2026-10-30).
    composicao = quadro(
        "Por classe",
        lista(
            [
                Grupo(
                    [
                        Linha(
                            classe,
                            brl(valor),
                            f"{valor / patrimonio:.0%} da carteira" if patrimonio else "",
                            icone="pie_chart",
                            cor=(cart.CLASSES.index(classe) % 6) + 1,
                            progresso=float(valor / patrimonio) if patrimonio else 0.0,
                        )
                        for classe, valor in sorted(
                            por_classe.items(), key=lambda par: par[1], reverse=True
                        )
                        if valor
                    ]
                )
            ]
        ),
    )
    st.html(colunas(principal, composicao, proporcao="principal"))

    coluna_cdi, coluna_classe = st.columns(2, gap="large")
    with coluna_cdi:
        st.html(secao("Estou ganhando do CDI?"))
        graficos.linhas_com_rotulo(
            meses,
            {
                "Carteira": [m.carteira_pct for m in historico],
                "CDI": [m.cdi_pct for m in historico],
                "IFIX": [m.ifix_pct for m in historico],
            },
        )
        st.caption("Rentabilidade acumulada nos últimos 12 meses, sem contar os aportes.")
    with coluna_classe:
        st.html(secao("Patrimônio por classe"))
        graficos.barras_empilhadas(
            meses, {c: [m.por_classe[c] for m in historico] for c in cart.CLASSES}
        )

# --------------------------------------------------------------------------- Carteira
with aba_carteira:
    st.html(secao("Alocação contra a sua meta"))
    graficos.alocacao_contra_meta(
        [(c, por_classe[c] / patrimonio * 100, meta[c]) for c in cart.CLASSES]
    )
    grupos = []
    for classe in cart.CLASSES:
        da_classe = sorted(
            (a for a in ativos if a.classe == classe), key=lambda a: a.valor, reverse=True
        )
        if not da_classe:
            continue
        linhas = []
        for a in da_classe:
            if a.cotas is not None:
                detalhe = f"{a.cotas} cotas · P/VP {a.p_vp:.2f} · DY {a.dy_12m:.1f}%".replace(
                    ".", ","
                )
            else:
                detalhe = a.nome
            linhas.append(
                Linha(
                    a.codigo,
                    brl(a.valor),
                    detalhe,
                    icone=ICONE_DA_CLASSE[classe],
                    cor=COR_DA_CLASSE[classe],
                    valor_detalhe=f"{_pct(a.variacao)} · {_pct(a.valor / patrimonio * 100, False)}",
                    tom_detalhe="positivo" if a.variacao >= 0 else "negativo",
                )
            )
        total = sum((a.valor for a in da_classe), Decimal(0))
        grupos.append(Grupo(linhas, classe, brl(total)))
    st.html(secao("Ativos", "variação sobre o preço médio · peso"))
    st.html(lista(grupos))
    lido = next((f.lido_em for f in dados.fontes_de_dados() if f.lido_em), None)
    st.caption(
        "Cotação, P/VP e DY do Investidor10"
        + (f", lidos em {data_curta(lido)}." if lido else ".")
        + " Importar posição por print (RF23) chega na Fase 2."
    )

# -------------------------------------------------------------------------- Proventos
with aba_proventos:
    previsto = sum((a.provento_do_mes for a in ativos), Decimal(0))
    estimado = sum((a.provento_do_mes for a in ativos if a.provento_estimado), Decimal(0))
    st.html(
        destaque(
            "Proventos previstos no mês",
            brl(previsto),
            f"{brl(previsto - estimado)} anunciados · {brl(estimado)} estimados pela média",
            "positivo",
        )
    )
    st.html(secao("Recebido por mês"))
    graficos.barras_com_destaque(meses, [m.proventos for m in historico])

    agenda = sorted((a for a in ativos if a.data_com), key=lambda a: a.data_com or date.max)
    st.html(secao("Agenda", "data-com → pagamento"))
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            a.codigo,
                            brl(a.provento_do_mes),
                            f"Com em {data_curta(a.data_com)} · paga em {data_curta(a.pagamento)}"
                            if a.data_com and a.pagamento
                            else "",
                            icone=ICONE_DA_CLASSE[a.classe],
                            cor=COR_DA_CLASSE[a.classe],
                            selo=("estimado", "informativo") if a.provento_estimado else None,
                            valor_detalhe=(
                                f"yield on cost {(a.provento_do_mes * 12 / a.custo * 100):.1f}%"
                            ).replace(".", ","),
                            tom="positivo",
                        )
                        for a in agenda
                    ]
                )
            ]
        )
    )

# ----------------------------------------------------------------------- Onde aportar
with aba_aporte:
    st.html(
        '<p class="fin-legenda">Sugestão pelas <strong>suas</strong> regras (metas de alocação, '
        "P/VP máximo, peso máximo por ativo, liquidez mínima). Não é recomendação de analista "
        "nem previsão de preço.</p>"
    )
    texto = st.text_input("Quanto vai aportar (R$)", value="500,00", key="aporte_valor")
    aporte = ler_valor(texto) or Decimal(0)
    criterios = cart.Criterios()
    sugestoes, barrados = cart.onde_aportar(aporte, ativos, meta, criterios)
    if sugestoes:
        st.html(
            destaque(
                "Distribuição sugerida",
                brl(aporte),
                f"{len([s for s in sugestoes if s.cotas])} fundos e "
                f"{brl(sum((s.valor for s in sugestoes if s.cotas is None), Decimal(0)))} "
                f"em {criterios.destino_da_sobra}",
            )
        )
        st.html(
            lista(
                [
                    Grupo(
                        [
                            Linha(
                                s.destino,
                                brl(s.valor),
                                s.motivo,
                                icone=ICONE_DA_CLASSE[s.classe],
                                cor=COR_DA_CLASSE[s.classe],
                                valor_detalhe=f"{s.cotas} cotas" if s.cotas else "",
                            )
                            for s in sugestoes
                        ]
                    )
                ]
            )
        )
    if barrados:
        st.html(secao("Ficaram de fora desta vez"))
        st.html(
            lista([Grupo([Linha(b.codigo, "", b.motivo, icone="block", cor=6) for b in barrados])])
        )
    st.caption(
        f"Critérios: P/VP até {criterios.p_vp_maximo:.2f}, peso até "
        f"{criterios.peso_maximo_por_ativo:.0f}% por ativo, liquidez a partir de "
        f"R$ {criterios.liquidez_minima / 1000:.0f} mil/dia. Editáveis em Ajustes → "
        "Investimentos (em construção).".replace(".00", ",00")
    )

# --------------------------------------------------------------------------- Projeção
with aba_projecao:
    st.html('<p class="fin-legenda">Uma conta com premissas visíveis, não previsão de mercado.</p>')
    with st.container(horizontal=True, gap="small"):
        aporte_mensal = ler_valor(st.text_input("Aporte por mês (R$)", "650,00")) or Decimal(0)
        dy = ler_valor(st.text_input("DY ao ano (%)", "9,0")) or Decimal(0)
        anos = st.segmented_control("Horizonte", [5, 10, 20], default=10, key="proj_anos")
    meses_proj = 12 * int(anos or 10)

    def _serie(dy_anual: Decimal) -> list[Decimal]:
        valor, pontos = patrimonio, [patrimonio]
        for _ in range(meses_proj):
            valor = valor + aporte_mensal + valor * dy_anual / 100 / 12
            pontos.append(valor)
        return pontos

    central, baixo, alto = _serie(dy), _serie(dy - 2), _serie(dy + 2)
    renda_final = central[-1] * dy / 100 / 12
    st.html(
        destaque(
            f"Em {anos} anos",
            brl(central[-1]),
            f"Renda de {brl(renda_final)}/mês com DY de {dy:.1f}%".replace(".", ",")
            + f" · faixa de {brl(baixo[-1])} a {brl(alto[-1])} (DY ±2 p.p.)",
            "positivo",
        )
    )
    graficos.projecao_com_faixa(list(range(meses_proj + 1)), central, baixo, alto)
