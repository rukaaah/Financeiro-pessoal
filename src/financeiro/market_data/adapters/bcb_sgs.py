"""Meta Selic pela API de dados abertos do Banco Central (SGS, série 432).

Formato da resposta: ``[{"data": "dd/mm/aaaa", "valor": "15.00"}, ...]``, um ponto por
dia. Sem rede aqui: o job baixa, este módulo só lê.
"""

import json
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from financeiro.market_data.domain.oportunidade import Selic

URL = (
    "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados"
    "?formato=json&dataInicial={inicio:%d/%m/%Y}&dataFinal={fim:%d/%m/%Y}"
)


def url(hoje: date) -> str:
    return URL.format(inicio=hoje - timedelta(days=120), fim=hoje)


def ler_selic(corpo: bytes | str, hoje: date) -> Selic | None:
    try:
        linhas = json.loads(corpo)
        pontos = sorted(
            (date(int(d[6:]), int(d[3:5]), int(d[:2])), Decimal(str(v)))
            for d, v in ((x["data"], x["valor"]) for x in linhas)
        )
    except (ValueError, KeyError, TypeError, InvalidOperation):
        return None
    if not pontos:
        return None
    limite = hoje - timedelta(days=90)
    antigos = [v for d, v in pontos if d <= limite]
    return Selic(pontos[-1][1], antigos[-1] if antigos else None)
