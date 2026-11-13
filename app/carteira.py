"""Carteira de investimentos: modelo, dados de exemplo e a regra do "Onde aportar".

Revisão de 2026-10-29: o Pedro achou a aba Investimentos "ridiculamente pouco
específica" e pediu a referência de apps que rastreiam carteira (Investidor10,
Kinvo). Este módulo dá à tela o que eles mostram — patrimônio por classe,
rentabilidade contra CDI e IFIX, proventos e agenda, alocação contra meta — e a
sugestão de aporte pelas regras do próprio usuário.

TUDO AQUI É EXEMPLO. Tickers com cinco letras (DEMO11, TESTE11…) não existem na
B3 de propósito: nenhum indicador real aparece antes do scraper.

TODO(claude-code): modelo e regra vão para `financeiro.investments.domain`;
dados vêm de `investments.application` + `market_data` (job agendado, ADR-009).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_DOWN, Decimal

from app.formatacao import hoje, primeiro_dia_do_mes, somar_meses

CLASSES = ("Papel", "Tijolo", "Logística", "FI-Infra", "Renda fixa")
RENDA_FIXA = "Renda fixa"


@dataclass(frozen=True, slots=True)
class Ativo:
    codigo: str
    nome: str
    classe: str
    valor: Decimal  # valor de mercado da posição
    custo: Decimal
    cotas: int | None = None  # None para renda fixa
    preco: Decimal | None = None
    p_vp: Decimal | None = None
    dy_12m: Decimal | None = None  # p.p.
    liquidez_diaria: Decimal | None = None  # R$ negociados por dia
    provento_por_cota: Decimal | None = None
    provento_estimado: bool = False
    data_com: date | None = None
    pagamento: date | None = None

    @property
    def variacao(self) -> Decimal:
        """Variação contra o preço médio, em p.p."""
        return (self.valor / self.custo - 1) * 100 if self.custo else Decimal(0)

    @property
    def provento_do_mes(self) -> Decimal:
        if self.cotas is None or self.provento_por_cota is None:
            return Decimal(0)
        return self.provento_por_cota * self.cotas


@dataclass(frozen=True, slots=True)
class MesDaCarteira:
    mes: date
    por_classe: dict[str, Decimal]
    aportado: Decimal  # acumulado
    proventos: Decimal  # recebidos no mês
    carteira_pct: Decimal  # rentabilidade acumulada desde o início da janela, p.p.
    cdi_pct: Decimal
    ifix_pct: Decimal

    @property
    def patrimonio(self) -> Decimal:
        return sum(self.por_classe.values(), Decimal(0))


@dataclass(frozen=True, slots=True)
class Criterios:
    """Regras do usuário para o "Onde aportar" (editáveis em Ajustes → Investimentos)."""

    p_vp_maximo: Decimal = Decimal("1.00")
    peso_maximo_por_ativo: Decimal = Decimal("20")  # % do patrimônio depois do aporte
    liquidez_minima: Decimal = Decimal("500000")  # R$/dia
    destino_da_sobra: str = "CDB Inter"


def _d(texto: str) -> Decimal:
    return Decimal(texto)


# (código, nome, classe, cotas, preço, preço médio, P/VP, DY 12m, liquidez/dia,
#  provento por cota, provento estimado?, dias até a data-com)
_FIIS = (
    ("DEMO11", "Demo Recebíveis", "Papel", 40, "9.62", "9.85", "0.94", "12.8", "2100000",
     "0.11", False, 2),
    ("FICTA11", "Ficta Crédito Imobiliário", "Papel", 25, "98.10", "96.40", "1.03", "11.9",
     "1500000", "1.05", True, 9),
    ("TESTE11", "Teste Shoppings", "Tijolo", 12, "102.30", "108.00", "0.88", "8.9", "900000",
     "0.72", False, 5),
    ("EXEMP11", "Exemplo Logística", "Logística", 10, "158.40", "150.20", "0.97", "8.4",
     "3200000", "1.10", False, 14),
    ("MODEL11", "Modelo Infraestrutura", "FI-Infra", 30, "91.70", "95.00", "0.92", "13.4",
     "350000", "1.08", True, 20),
)  # fmt: skip


def ativos() -> tuple[Ativo, ...]:
    base = hoje()
    fiis = tuple(
        Ativo(
            codigo, nome, classe,
            valor=_d(preco) * cotas, custo=_d(pm) * cotas, cotas=cotas, preco=_d(preco),
            p_vp=_d(p_vp), dy_12m=_d(dy), liquidez_diaria=_d(liq),
            provento_por_cota=_d(prov), provento_estimado=estimado,
            data_com=base + timedelta(days=dias), pagamento=base + timedelta(days=dias + 10),
        )
        for codigo, nome, classe, cotas, preco, pm, p_vp, dy, liq, prov, estimado, dias in _FIIS
    )  # fmt: skip
    renda_fixa = (
        Ativo("CDB PicPay", "CDB 100% do CDI", RENDA_FIXA, _d("1250.00"), _d("1180.00")),
        Ativo("CDB Inter", "CDB 102% do CDI", RENDA_FIXA, _d("820.00"), _d("790.00")),
        Ativo("Tesouro Selic", "Tesouro Selic 2031", RENDA_FIXA, _d("1500.00"), _d("1430.00")),
    )
    return fiis + renda_fixa


def metas() -> dict[str, Decimal]:
    """Meta de alocação por classe, em % (soma 100). Editável em Ajustes."""
    return {
        "Papel": _d("30"),
        "Tijolo": _d("20"),
        "Logística": _d("15"),
        "FI-Infra": _d("10"),
        RENDA_FIXA: _d("25"),
    }


def historico(meses: int = 12) -> tuple[MesDaCarteira, ...]:
    """Doze meses de carteira, crescendo com aportes de R$ 500 e extras a cada 3 meses."""
    atual = ativos()
    hoje_por_classe = {
        c: sum((a.valor for a in atual if a.classe == c), Decimal(0)) for c in CLASSES
    }
    inicio = somar_meses(primeiro_dia_do_mes(hoje()), -(meses - 1))
    pontos = []
    for i in range(meses):
        fator = _d("0.55") + _d("0.45") * i / (meses - 1)
        ondulacao = 1 + _d("0.012") * ((i % 4) - _d("1.5"))
        por_classe = {
            c: (v * fator * ondulacao).quantize(_d("0.01")) for c, v in hoje_por_classe.items()
        }
        pontos.append(
            MesDaCarteira(
                somar_meses(inicio, i),
                por_classe,
                aportado=_d("6000") + _d("500") * i + _d("1000") * (i // 3),
                proventos=(_d("38") + _d("3.4") * i + 4 * (i % 3)).quantize(_d("0.01")),
                carteira_pct=(_d("0.95") * i + _d("0.6") * ((i % 3) - 1)).quantize(_d("0.01")),
                cdi_pct=(_d("0.87") * i).quantize(_d("0.01")),
                ifix_pct=(_d("0.55") * i + _d("0.9") * ((i % 4) - _d("1.5"))).quantize(_d("0.01")),
            )
        )
    return tuple(pontos)


# ------------------------------------------------------------------- onde aportar


@dataclass(frozen=True, slots=True)
class Sugestao:
    destino: str
    classe: str
    valor: Decimal
    cotas: int | None
    motivo: str


@dataclass(frozen=True, slots=True)
class Barrado:
    codigo: str
    motivo: str


def _br(valor: Decimal, casas: int = 2) -> str:
    return f"{valor:.{casas}f}".replace(".", ",")


def _barrar(ativo: Ativo, peso: Decimal, criterios: Criterios) -> str:
    """Por que o ativo fica fora desta vez, ou "" se passa nos critérios."""
    if ativo.p_vp is not None and ativo.p_vp > criterios.p_vp_maximo:
        return f"P/VP {_br(ativo.p_vp)} acima do seu máximo ({_br(criterios.p_vp_maximo)})"
    if ativo.liquidez_diaria is not None and ativo.liquidez_diaria < criterios.liquidez_minima:
        return (
            f"liquidez de R$ {ativo.liquidez_diaria / 1000:.0f} mil/dia, abaixo do mínimo "
            f"de R$ {criterios.liquidez_minima / 1000:.0f} mil"
        )
    if peso >= criterios.peso_maximo_por_ativo:
        return (
            f"já pesa {_br(peso, 1)}% da carteira "
            f"(máximo {_br(criterios.peso_maximo_por_ativo, 0)}%)"
        )
    return ""


def onde_aportar(
    aporte: Decimal,
    carteira: tuple[Ativo, ...],
    meta: dict[str, Decimal],
    criterios: Criterios,
) -> tuple[list[Sugestao], list[Barrado]]:
    """Distribui o aporte pelas metas e critérios DO USUÁRIO. Não é recomendação.

    1. Classes abaixo da meta (contando o patrimônio depois do aporte) recebem na
       proporção do que falta.
    2. Dentro da classe de FII, só ativos que passam nos critérios; entre eles, o
       de menor P/VP (preferência declarada do Pedro: comprar com desconto).
       Compra em cotas inteiras.
    3. Renda fixa, classe sem ativo elegível e o que não fecha cota vão para
       `destino_da_sobra` (o CDB do Inter, onde ele junta a sobra de cada aporte).
    """
    if aporte <= 0:
        return [], []
    total_depois = sum((a.valor for a in carteira), Decimal(0)) + aporte
    atual = {c: sum((a.valor for a in carteira if a.classe == c), Decimal(0)) for c in meta}
    falta = {c: max(meta[c] / 100 * total_depois - atual[c], Decimal(0)) for c in meta}
    soma_falta = sum(falta.values(), Decimal(0))

    barrados: list[Barrado] = []
    elegiveis: dict[str, list[Ativo]] = {}
    for ativo in carteira:
        if ativo.classe == RENDA_FIXA:
            continue
        motivo = _barrar(ativo, ativo.valor / total_depois * 100, criterios)
        if motivo:
            barrados.append(Barrado(ativo.codigo, motivo))
        else:
            elegiveis.setdefault(ativo.classe, []).append(ativo)

    sugestoes: list[Sugestao] = []
    for classe in meta:
        if classe == RENDA_FIXA or falta[classe] == 0 or soma_falta == 0:
            continue
        parte = aporte * falta[classe] / soma_falta
        candidatos = sorted(elegiveis.get(classe, []), key=lambda a: a.p_vp or Decimal(9))
        if not candidatos:
            continue
        escolhido = candidatos[0]
        preco = escolhido.preco
        if preco is None:
            continue
        cotas = int((parte / preco).to_integral_value(ROUND_DOWN))
        if cotas == 0:
            continue
        abaixo = falta[classe] / total_depois * 100
        sugestoes.append(
            Sugestao(
                escolhido.codigo,
                classe,
                preco * cotas,
                cotas,
                f"{classe} está {_br(abaixo, 1)} p.p. abaixo da meta; menor P/VP entre os "
                f"elegíveis da classe ({_br(escolhido.p_vp or Decimal(0))}).",
            )
        )

    sobra = aporte - sum((s.valor for s in sugestoes), Decimal(0))
    if sobra > 0:
        if not soma_falta:
            motivo = "Todas as classes estão na meta: o aporte fica na reserva de sobra."
        elif falta.get(RENDA_FIXA, Decimal(0)) > 0:
            motivo = "Renda fixa abaixo da meta, mais o que não fechou cota inteira."
        else:
            motivo = "O que não fechou cota inteira nem tinha ativo elegível na classe."
        sugestoes.append(Sugestao(criterios.destino_da_sobra, RENDA_FIXA, sobra, None, motivo))
    return sugestoes, barrados
