"""Formatação para a tela: dinheiro, percentual e datas em português do Brasil.

Só apresentação. Nenhuma regra de negócio mora aqui, e nenhum valor monetário
vira `float`: tudo passa por `Decimal` (CLAUDE.md, regras inegociáveis).
"""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

FUSO = ZoneInfo("America/Sao_Paulo")

MESES = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)
MESES_CURTOS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


def hoje() -> date:
    """Hoje no fuso de Brasília, que é o de quem usa o app."""
    return datetime.now(FUSO).date()


def primeiro_dia_do_mes(referencia: date) -> date:
    return referencia.replace(day=1)


def somar_meses(referencia: date, meses: int) -> date:
    """Primeiro dia do mês `meses` depois (ou antes, se negativo) de `referencia`."""
    total = referencia.year * 12 + (referencia.month - 1) + meses
    return date(total // 12, total % 12 + 1, 1)


def brl(valor: Decimal, *, com_sinal: bool = False) -> str:
    """`Decimal('1234.5')` -> `R$ 1.234,50`."""
    texto = f"{abs(valor):,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")
    if valor < 0:
        prefixo = "-"
    elif com_sinal and valor > 0:
        prefixo = "+"
    else:
        prefixo = ""
    return f"{prefixo}R$ {texto}"


def percentual(valor: Decimal, casas: int = 1) -> str:
    """`Decimal('7.25')` -> `7,3%` (o valor já está em pontos percentuais)."""
    return f"{valor:.{casas}f}".replace(".", ",") + "%"


def mes_extenso(referencia: date) -> str:
    """`2026-10-01` -> `outubro de 2026`."""
    return f"{MESES[referencia.month - 1]} de {referencia.year}"


def mes_curto(referencia: date) -> str:
    """`2026-10-01` -> `out/26`."""
    return f"{MESES_CURTOS[referencia.month - 1]}/{referencia.year % 100:02d}"


def mes_numerico(referencia: date) -> str:
    """`2026-10-01` -> `10/2026`."""
    return f"{referencia.month:02d}/{referencia.year}"


def data_curta(referencia: date) -> str:
    """`2026-10-07` -> `07/10`."""
    return f"{referencia.day:02d}/{referencia.month:02d}"


def ler_valor(texto: str) -> Decimal | None:
    """Lê o que a pessoa digitou (`12,50`, `1.234,56`, `R$ 8`) como `Decimal`.

    Existe porque `st.number_input` devolve `float`, e dinheiro nunca é `float`
    neste projeto. Devolve `None` quando o texto não é um valor válido e
    positivo, para a tela mostrar o erro em vez de gravar lixo.
    """
    limpo = texto.strip().replace("R$", "").replace(" ", "")
    if not limpo:
        return None
    if "," in limpo:
        limpo = limpo.replace(".", "").replace(",", ".")
    try:
        valor = Decimal(limpo)
    except InvalidOperation:
        return None
    if not valor.is_finite() or valor <= 0:
        return None
    return valor.quantize(Decimal("0.01"))
