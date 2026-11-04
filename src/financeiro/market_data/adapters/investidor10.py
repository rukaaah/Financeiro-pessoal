"""Leitura da página de um FII no Investidor10 (uso permitido pelo Pedro, Apêndice A).

Só o parser, sem rede: recebe o HTML e devolve os números. Assim o teste roda com uma
página sintética e a regra de extração fica num lugar só. Se o site mudar o layout, o
parser devolve None no campo e o job registra a falha sem gravar número errado.
"""

import re
from dataclasses import dataclass
from decimal import Decimal

_TAG = re.compile(r"<[^>]+>")
_ESPACO = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class Indicadores:
    preco: Decimal | None
    pvp: Decimal | None
    dy_12m: Decimal | None
    liquidez: Decimal | None


def _numero_br(texto: str) -> Decimal | None:
    m = re.search(r"-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?", texto)
    if not m:
        return None
    return Decimal(m.group(0).replace(".", "").replace(",", "."))


def _trecho(html: str, marcador: str, tamanho: int = 400) -> str | None:
    i = html.find(marcador)
    if i < 0:
        return None
    return _ESPACO.sub(" ", _TAG.sub(" ", html[i : i + tamanho]))


def ler_indicadores(html: str) -> Indicadores:
    cotacao = _trecho(html, "_card cotacao")
    vp = _trecho(html, "_card vp")
    dy = _trecho(html, "_card dy")
    liquidez = _trecho(html, "Liquidez Diária</span>") or _trecho(html, 'Liquidez Diária">')

    preco = _numero_br(cotacao.split("R$", 1)[1]) if cotacao and "R$" in cotacao else None
    pvp = _numero_br(vp.split("P/VP", 1)[1]) if vp and "P/VP" in vp else None
    dy_12m = _numero_br(dy.split("DY (12M)", 1)[1]) if dy and "DY (12M)" in dy else None

    valor_liquidez = None
    if liquidez and "R$" in liquidez:
        depois = liquidez.split("R$", 1)[1]
        base = _numero_br(depois)
        sufixo = re.search(r"\d\s*(K|M|B)\b", depois)
        multiplicador = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}.get(
            sufixo.group(1) if sufixo else "", 1
        )
        valor_liquidez = base * multiplicador if base is not None else None

    return Indicadores(preco=preco, pvp=pvp, dy_12m=dy_12m, liquidez=valor_liquidez)
