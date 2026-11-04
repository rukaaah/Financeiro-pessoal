from decimal import Decimal
from pathlib import Path

from financeiro.market_data.adapters.investidor10 import Indicadores, ler_indicadores

FIXTURE = Path(__file__).parents[1] / "fixtures" / "investidor10_sintetico.html"


def test_le_os_quatro_indicadores_da_pagina_sintetica() -> None:
    assert ler_indicadores(FIXTURE.read_text(encoding="utf-8")) == Indicadores(
        preco=Decimal("102.30"),
        pvp=Decimal("0.88"),
        dy_12m=Decimal("8.90"),
        liquidez=Decimal("1250000.00"),
    )


def test_layout_desconhecido_devolve_vazio_em_vez_de_numero_errado() -> None:
    assert ler_indicadores("<html><body>Página mudou</body></html>") == Indicadores(
        None, None, None, None
    )
