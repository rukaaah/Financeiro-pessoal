"""Cotação intradia pela brapi (plano gratuito: token, 1 ativo por pedido, ~30 min de atraso).

Limites do plano gratuito, pela própria brapi (https://brapi.dev/faq/quais-as-limitacoes):
15.000 requisições por mês, 1 ativo por chamada, 1 requisição simultânea. Sem rede aqui.
"""

import json
from decimal import Decimal


def ler_preco(corpo: str) -> Decimal | None:
    """``regularMarketPrice`` do primeiro resultado; None se a resposta não tiver preço."""
    try:
        dados = json.loads(corpo)
        preco = dados["results"][0]["regularMarketPrice"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    if not isinstance(preco, int | float) or isinstance(preco, bool) or preco <= 0:
        return None
    return Decimal(str(preco))
