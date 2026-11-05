"""Leitura do informe mensal estruturado de FII da CVM (dados abertos, licença ODbL).

Fonte: https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal (atualização semanal).
CSV com ``;``, em latin-1. O arquivo ``geral`` liga ISIN ao CNPJ; o ``complemento``
traz ``Valor_Patrimonial_Cotas`` e ``Percentual_Dividend_Yield_Mes`` (fração).
Um mês pode ser reapresentado: fica a maior ``Versao``. Sem rede aqui.
"""

import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from financeiro.market_data.domain.indicadores import InformeMensal


def _linhas(texto: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(texto), delimiter=";"))


def _data(texto: str) -> date:
    return date.fromisoformat(texto[:10])


def isin_para_cnpj(geral: str) -> dict[str, str]:
    """ISIN da cota → CNPJ, pelo informe mais recente de cada fundo."""
    melhor: dict[str, tuple[tuple[str, int], str]] = {}
    for linha in _linhas(geral):
        isin = (linha.get("Codigo_ISIN") or "").strip()
        cnpj = (linha.get("CNPJ_Fundo_Classe") or "").strip()
        versao = (linha.get("Versao") or "0").strip()
        if not isin or not cnpj or not versao.isdigit():
            continue
        chave = (linha.get("Data_Referencia") or "", int(versao))
        if isin not in melhor or chave > melhor[isin][0]:
            melhor[isin] = (chave, cnpj)
    return {isin: cnpj for isin, (_, cnpj) in melhor.items()}


def informes_por_cnpj(complemento: str, cnpjs: set[str]) -> dict[str, list[InformeMensal]]:
    """Os meses de cada CNPJ pedido, um por mês (maior versão)."""
    escolhidos: dict[tuple[str, date], tuple[int, InformeMensal]] = {}
    for linha in _linhas(complemento):
        cnpj = (linha.get("CNPJ_Fundo_Classe") or "").strip()
        if cnpj not in cnpjs:
            continue
        try:
            ref = _data(linha["Data_Referencia"])
            versao = int(linha.get("Versao") or 0)
            vp = Decimal(linha["Valor_Patrimonial_Cotas"])
            dy = Decimal(linha["Percentual_Dividend_Yield_Mes"] or "0")
        except (KeyError, ValueError, InvalidOperation):
            continue
        chave = (cnpj, ref)
        if chave not in escolhidos or versao > escolhidos[chave][0]:
            escolhidos[chave] = (versao, InformeMensal(referencia=ref, vp_cota=vp, dy_mes=dy))
    saida: dict[str, list[InformeMensal]] = {}
    for (cnpj, _), (_, informe) in sorted(escolhidos.items()):
        saida.setdefault(cnpj, []).append(informe)
    return saida
