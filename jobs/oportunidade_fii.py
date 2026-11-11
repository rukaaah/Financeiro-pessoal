"""Medidor diário de oportunidade de compra dos FIIs em carteira (ADR-022).

Roda no pregão (13h30 e 16h30, com o preço intradia da brapi já no banco) e à noite
(com o fechamento oficial da B3 e as notícias do dia). Para cada ticker em carteira
de alguém (``tickers_em_carteira()``):

1. lê do banco o último ano de pregões (preço, P/VP, DY 12m e volume, gravados pelo
   job de cotações) e o resumo dos documentos oficiais (job de notícias);
2. calcula a nota, o veredito e o cenário (``domain/oportunidade.py``), sem IA;
3. para "grande dia" e "bom preço", pede à Workers AI o motivo em português, com o
   prompt de analista. A IA só pode rebaixar o veredito e só pode citar números dos
   fatos; resposta fora disso é descartada e fica o texto da conta.

Também grava o panorama do dia: tendência entre os fundos acompanhados e a meta Selic
pela API de dados abertos do Banco Central (SGS 432). Cotas sugeridas não saem daqui:
dependem do aporte e das regras de cada usuário e são calculadas na tela.

Uso:
    export DATABASE_URL=...   # papel com escrita em fii_opportunities e fii_market_daily
    export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...   # opcionais
    uv run --group jobs python jobs/oportunidade_fii.py
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import psycopg

from financeiro.market_data.adapters import bcb_sgs
from financeiro.market_data.adapters.workers_ai import MODELO, gerar
from financeiro.market_data.domain.oportunidade import (
    Leitura,
    Pregao,
    Selic,
    avaliar,
    fatos_para_ia,
    leitura_sem_ia,
    ler_resposta,
    mensagens,
    panorama,
)

AGENTE = "financeiro-pessoal-job (projeto pessoal)"
SP = ZoneInfo("America/Sao_Paulo")

Cursor = psycopg.Cursor[tuple[object, ...]]

PANORAMA = """
    INSERT INTO fii_market_daily (day, trend, funds, above_average, median_change_21,
                                  rising, falling, selic, selic_direction)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (day) DO UPDATE SET
        trend = excluded.trend, funds = excluded.funds, above_average = excluded.above_average,
        median_change_21 = excluded.median_change_21,
        rising = excluded.rising, falling = excluded.falling,
        selic = coalesce(excluded.selic, fii_market_daily.selic),
        selic_direction = coalesce(excluded.selic_direction, fii_market_daily.selic_direction),
        generated_at = now()
"""

OPORTUNIDADE = """
    INSERT INTO fii_opportunities (ticker, day, price, score, percentile, trading_days, verdict,
                                   reason, risks, outlook, target_price, facts, model)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb, %s)
    ON CONFLICT (ticker, day) DO UPDATE SET
        price = excluded.price, score = excluded.score, percentile = excluded.percentile,
        trading_days = excluded.trading_days, verdict = excluded.verdict,
        reason = excluded.reason, risks = excluded.risks, outlook = excluded.outlook,
        target_price = excluded.target_price, facts = excluded.facts, model = excluded.model,
        generated_at = now()
"""


def _dec(v: object) -> Decimal | None:
    return v if isinstance(v, Decimal) else None


def series(cur: Cursor, hoje: date) -> dict[str, list[Pregao]]:
    cur.execute(
        "SELECT q.ticker, q.quoted_on, q.price, q.pvp, q.dy_12m, q.liquidity"
        " FROM asset_quotes q JOIN tickers_em_carteira() AS t(ticker) ON t.ticker = q.ticker"
        " WHERE q.quoted_on > %s ORDER BY q.ticker, q.quoted_on",
        (hoje - timedelta(days=380),),
    )
    saida: dict[str, list[Pregao]] = {}
    for ticker, dia, preco, p, dy, volume in cur.fetchall():
        assert isinstance(dia, date) and isinstance(preco, Decimal)
        saida.setdefault(str(ticker), []).append(
            Pregao(dia, preco, _dec(p), _dec(dy), _dec(volume))
        )
    return saida


def resumos(cur: Cursor) -> dict[str, str]:
    cur.execute("SELECT ticker, summary FROM fii_insights")
    return {str(t): str(s) for t, s in cur.fetchall()}


def selic_de_hoje(hoje: date) -> Selic | None:
    pedido = urllib.request.Request(bcb_sgs.url(hoje), headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return bcb_sgs.ler_selic(r.read(), hoje)
    except (urllib.error.URLError, TimeoutError) as erro:
        print(f"Selic: Banco Central falhou ({erro})", file=sys.stderr)
        return None


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2
    conta, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    hoje = datetime.now(SP).date()
    selic = selic_de_hoje(hoje)
    with psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://")) as conexao:
        with conexao.cursor() as cur:
            todas = series(cur, hoje)
            textos = resumos(cur)
            pano = panorama(todas)
            cur.execute(
                PANORAMA,
                (
                    pano.dia if pano.fundos else hoje,
                    pano.tendencia,
                    pano.fundos,
                    pano.acima_da_media,
                    pano.variacao_mediana_21d,
                    pano.subindo,
                    pano.caindo,
                    selic.atual if selic else None,
                    selic.direcao if selic else None,
                ),
            )
            taxa = selic.atual if selic else "?"
            print(f"Panorama: {pano.tendencia} entre {pano.fundos} fundos; Selic {taxa}")
            for ticker, hist in todas.items():
                sinal = avaliar(ticker, hist)
                leitura: Leitura | None = None
                modelo: str | None = None
                if sinal.veredito in ("grande_dia", "bom_preco") and conta and token:
                    fatos = fatos_para_ia(sinal, pano, selic)
                    try:
                        bruta = gerar(
                            mensagens(sinal, pano, selic, textos.get(ticker)), conta, token, AGENTE
                        )
                    except (urllib.error.URLError, TimeoutError) as erro:
                        print(f"{ticker}: IA falhou ({erro})", file=sys.stderr)
                        bruta = None
                    leitura = ler_resposta(bruta, sinal, fatos) if bruta is not None else None
                    modelo = MODELO if leitura else None
                    if bruta is not None and leitura is None:
                        print(f"{ticker}: resposta da IA descartada (número fora dos fatos)")
                leitura = leitura or leitura_sem_ia(sinal)
                cur.execute(
                    OPORTUNIDADE,
                    (
                        ticker,
                        sinal.dia,
                        sinal.preco,
                        sinal.nota,
                        sinal.percentil,
                        sinal.pregoes,
                        leitura.veredito,
                        leitura.motivo,
                        json.dumps(leitura.riscos, ensure_ascii=False),
                        leitura.previsao,
                        sinal.preco_alvo,
                        json.dumps(sinal.fatos, ensure_ascii=False),
                        modelo,
                    ),
                )
                print(f"{ticker}: {leitura.veredito} (nota {sinal.nota}, {sinal.pregoes} pregões)")
            cur.execute(
                "DELETE FROM fii_opportunities WHERE day < %s", (hoje - timedelta(days=400),)
            )
            cur.execute(
                "DELETE FROM fii_market_daily WHERE day < %s", (hoje - timedelta(days=400),)
            )
        conexao.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
