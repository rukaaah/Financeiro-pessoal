"""Chamada à Cloudflare Workers AI pela API REST, para o job (ADR-018, ADR-021).

O Worker usa o binding ``AI``; o job no GitHub Actions usa a REST com conta e token
(secrets ``CLOUDFLARE_ACCOUNT_ID`` e ``CLOUDFLARE_API_TOKEN``, com permissão
"Workers AI: Read"). Mesmo modelo do app.
"""

import json
import urllib.request

MODELO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
URL = "https://api.cloudflare.com/client/v4/accounts/{conta}/ai/run/{modelo}"


def ler_resposta_da_api(corpo: bytes | str) -> str | dict[str, object] | None:
    """``result.response``: texto, ou objeto quando o modelo já devolve JSON."""
    try:
        dados = json.loads(corpo)
        resposta = dados["result"]["response"]
    except (ValueError, KeyError, TypeError):
        return None
    return resposta if isinstance(resposta, str | dict) else None


def gerar(
    mensagens: list[dict[str, str]], conta: str, token: str, agente: str
) -> str | dict[str, object] | None:
    pedido = urllib.request.Request(
        URL.format(conta=conta, modelo=MODELO),
        data=json.dumps({"messages": mensagens, "max_tokens": 900, "temperature": 0.2}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": agente,
        },
        method="POST",
    )
    with urllib.request.urlopen(pedido, timeout=120) as r:
        return ler_resposta_da_api(r.read())
