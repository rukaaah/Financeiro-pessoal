"""P/VP e DY de 12 meses de um FII a partir de fontes oficiais (ADR-020).

Puro, só stdlib. O preço vem da B3 (fechamento) ou da brapi (intradia); o valor
patrimonial da cota e o DY do mês vêm do informe mensal da CVM.

A CVM define o DY do mês como "rendimentos declarados por cota no mês de referência /
valor patrimonial da cota do último dia útil do mês anterior". Então o rendimento
por cota do mês m é ``dy_mes(m) x vp_cota(m-1)``, e o DY de 12 meses sobre o preço
de hoje é a soma desses 12 rendimentos dividida pelo preço.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal


@dataclass(frozen=True, slots=True)
class InformeMensal:
    """Uma linha do informe mensal da CVM já escolhida (maior versão do mês)."""

    referencia: date  # primeiro dia do mês de referência
    vp_cota: Decimal
    dy_mes: Decimal  # fração: 0,0106 = 1,06 %


def _mes_anterior(d: date) -> date:
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


def pvp(preco: Decimal, informes: list[InformeMensal]) -> Decimal | None:
    """Preço sobre o valor patrimonial da cota do informe mais recente."""
    if not informes or preco <= 0:
        return None
    vp = max(informes, key=lambda i: i.referencia).vp_cota
    if vp <= 0:
        return None
    return (preco / vp).quantize(Decimal("0.0001"), ROUND_HALF_EVEN)


def rendimentos_12m(informes: list[InformeMensal]) -> Decimal | None:
    """Soma dos rendimentos por cota dos 12 meses mais recentes; None sem 13 meses seguidos."""
    por_mes = {i.referencia: i for i in informes}
    if not por_mes:
        return None
    mes = max(por_mes)
    soma = Decimal(0)
    for _ in range(12):
        anterior = _mes_anterior(mes)
        if mes not in por_mes or anterior not in por_mes:
            return None
        soma += por_mes[mes].dy_mes * por_mes[anterior].vp_cota
        mes = anterior
    return soma


def dy_12m_percentual(preco: Decimal, informes: list[InformeMensal]) -> Decimal | None:
    """DY de 12 meses sobre o preço, em pontos percentuais (8,9 = 8,9 %)."""
    soma = rendimentos_12m(informes)
    if soma is None or preco <= 0:
        return None
    return (soma / preco * 100).quantize(Decimal("0.0001"), ROUND_HALF_EVEN)
