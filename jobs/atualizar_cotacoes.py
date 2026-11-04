"""Job diário: cotação, P/VP, DY 12m e liquidez dos FIIs em carteira (RF10).

Roda no GitHub Actions. Uma requisição por ticker, só dos tickers em carteira de
alguém (`tickers_em_carteira()`), com pausa entre elas. A tela lê do banco, nunca
da web. Falha de um ticker não derruba os outros: o último dado bom continua lá,
com a data.

Uso:
    export DATABASE_URL=...   # papel com INSERT em asset_quotes (jobs; no dev, owner)
    uv run python jobs/atualizar_cotacoes.py
"""

import os
import sys
import time
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

from financeiro.market_data.adapters.investidor10 import ler_indicadores

PAUSA_S = 2.0
AGENTE = "financeiro-pessoal (projeto pessoal; uma leitura por dia por fundo)"


def buscar(ticker: str) -> str:
    pedido = urllib.request.Request(
        f"https://investidor10.com.br/fiis/{ticker.lower()}/", headers={"User-Agent": AGENTE}
    )
    with urllib.request.urlopen(pedido, timeout=20) as resposta:
        return resposta.read().decode("utf-8", errors="replace")


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2
    url = url.replace("postgresql+psycopg://", "postgresql://")
    falhas = 0
    with psycopg.connect(url) as conexao, conexao.cursor() as cur:
        cur.execute("SELECT * FROM tickers_em_carteira()")
        tickers = [str(linha[0]) for linha in cur.fetchall()]
        for indice, ticker in enumerate(tickers):
            if indice:
                time.sleep(PAUSA_S)
            try:
                dados = ler_indicadores(buscar(ticker))
            except OSError as erro:
                print(f"{ticker}: falha ao buscar ({erro.__class__.__name__})", file=sys.stderr)
                falhas += 1
                continue
            if dados.preco is None:
                print(f"{ticker}: layout não reconhecido; nada gravado", file=sys.stderr)
                falhas += 1
                continue
            cur.execute(
                "INSERT INTO asset_quotes"
                " (ticker, quoted_on, price, pvp, dy_12m, liquidity, source)"
                " VALUES (%s, %s, %s, %s, %s, %s, 'investidor10')"
                " ON CONFLICT (ticker, quoted_on) DO UPDATE SET price = excluded.price,"
                " pvp = excluded.pvp, dy_12m = excluded.dy_12m, liquidity = excluded.liquidity,"
                " fetched_at = now()",
                (
                    ticker,
                    datetime.now(ZoneInfo("America/Sao_Paulo")).date(),
                    dados.preco,
                    dados.pvp,
                    dados.dy_12m,
                    dados.liquidez,
                ),
            )
            conexao.commit()
            print(f"{ticker}: R$ {dados.preco}")
    print(f"{len(tickers) - falhas} de {len(tickers)} tickers atualizados.")
    return 1 if falhas and falhas == len(tickers) else 0


if __name__ == "__main__":
    raise SystemExit(main())
