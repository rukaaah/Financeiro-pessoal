"""Leitura do informe mensal estruturado de FII da CVM (dados abertos, licença ODbL).

Fonte: https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal (atualização semanal).
CSV com ``;``, em latin-1. O arquivo ``geral`` liga ISIN ao CNPJ; o ``complemento``
traz ``Valor_Patrimonial_Cotas`` e ``Percentual_Dividend_Yield_Mes`` (fração).
Um mês pode ser reapresentado: fica a maior ``Versao``. Sem rede aqui.
"""

import csv
import io
from dataclasses import dataclass
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


@dataclass(frozen=True, slots=True)
class PerfilDoFundo:
    """O cadastro do fundo no informe mais recente e as cotas emitidas mês a mês."""

    cnpj: str
    nome: str | None
    inicio: date | None
    segmento: str | None
    mandato: str | None
    gestao: str | None
    cotas_por_mes: dict[date, Decimal]


def _texto(linha: dict[str, str], campo: str) -> str | None:
    valor = (linha.get(campo) or "").strip()
    return valor or None


def _data_ou_nada(texto: str | None) -> date | None:
    try:
        return _data(texto) if texto else None
    except ValueError:
        return None


def _decimal_ou_nada(texto: str | None) -> Decimal | None:
    try:
        return Decimal(texto) if texto else None
    except InvalidOperation:
        return None


def perfis_por_cnpj(geral: str, cnpjs: set[str]) -> dict[str, PerfilDoFundo]:
    """Perfil pela linha mais recente (maior mês e versão); cotas emitidas de cada mês."""
    melhor: dict[str, tuple[tuple[str, int], dict[str, str]]] = {}
    cotas: dict[str, dict[date, tuple[int, Decimal]]] = {}
    for linha in _linhas(geral):
        cnpj = (linha.get("CNPJ_Fundo_Classe") or "").strip()
        versao = (linha.get("Versao") or "").strip()
        ref = _data_ou_nada(_texto(linha, "Data_Referencia"))
        if cnpj not in cnpjs or not versao.isdigit() or ref is None:
            continue
        chave = (ref.isoformat(), int(versao))
        if cnpj not in melhor or chave > melhor[cnpj][0]:
            melhor[cnpj] = (chave, linha)
        qtd = _decimal_ou_nada(_texto(linha, "Quantidade_Cotas_Emitidas"))
        mes = cotas.setdefault(cnpj, {})
        if qtd is not None and (ref not in mes or int(versao) > mes[ref][0]):
            mes[ref] = (int(versao), qtd)
    return {
        cnpj: PerfilDoFundo(
            cnpj=cnpj,
            nome=_texto(linha, "Nome_Fundo_Classe"),
            inicio=_data_ou_nada(_texto(linha, "Data_Funcionamento")),
            segmento=_texto(linha, "Segmento_Atuacao"),
            mandato=_texto(linha, "Mandato"),
            gestao=_texto(linha, "Tipo_Gestao"),
            cotas_por_mes={ref: q for ref, (_, q) in sorted(cotas.get(cnpj, {}).items())},
        )
        for cnpj, (_, linha) in melhor.items()
    }


def extras_por_cnpj(
    complemento: str, cnpjs: set[str]
) -> dict[tuple[str, date], tuple[int | None, Decimal | None]]:
    """Cotistas e patrimônio líquido de cada mês (maior versão)."""
    escolhidos: dict[tuple[str, date], tuple[int, int | None, Decimal | None]] = {}
    for linha in _linhas(complemento):
        cnpj = (linha.get("CNPJ_Fundo_Classe") or "").strip()
        versao = (linha.get("Versao") or "").strip()
        ref = _data_ou_nada(_texto(linha, "Data_Referencia"))
        if cnpj not in cnpjs or not versao.isdigit() or ref is None:
            continue
        cotistas_txt = _texto(linha, "Total_Numero_Cotistas")
        cotistas = int(cotistas_txt) if cotistas_txt and cotistas_txt.isdigit() else None
        pl = _decimal_ou_nada(_texto(linha, "Patrimonio_Liquido"))
        if (cnpj, ref) not in escolhidos or int(versao) > escolhidos[(cnpj, ref)][0]:
            escolhidos[(cnpj, ref)] = (int(versao), cotistas, pl)
    return {k: (c, p) for k, (_, c, p) in escolhidos.items()}
