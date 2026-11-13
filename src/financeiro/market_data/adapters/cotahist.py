"""Leitura do arquivo diário de cotações históricas da B3 (COTAHIST_DDDMMAAAA).

Layout oficial: "Layout do arquivo - Cotações Históricas", B3, revisão 02 de
05/10/2020. Registro tipo 01 com 245 posições; preços com 2 casas implícitas,
por lote de FATCOT unidades. Só o mercado à vista (TPMERC 010). Sem rede aqui.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Fechamento:
    ticker: str
    pregao: date
    preco: Decimal  # último preço do dia, por cota
    volume: Decimal  # volume financeiro do dia, em R$
    isin: str


def _campo(linha: str, inicio: int, fim: int) -> str:
    """Posições 1-based e inclusivas, como no documento da B3."""
    return linha[inicio - 1 : fim]


def ler_cotahist(texto: str, tickers: set[str]) -> dict[str, Fechamento]:
    saida: dict[str, Fechamento] = {}
    for linha in texto.splitlines():
        if len(linha) < 245 or _campo(linha, 1, 2) != "01":
            continue
        ticker = _campo(linha, 13, 24).strip()
        if ticker not in tickers or _campo(linha, 25, 27) != "010":
            continue
        fator = int(_campo(linha, 211, 217)) or 1
        data = _campo(linha, 3, 10)
        saida[ticker] = Fechamento(
            ticker=ticker,
            pregao=date(int(data[:4]), int(data[4:6]), int(data[6:])),
            preco=Decimal(int(_campo(linha, 109, 121))) / 100 / fator,
            volume=Decimal(int(_campo(linha, 171, 188))) / 100,
            isin=_campo(linha, 231, 242).strip(),
        )
    return saida
