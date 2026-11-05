"""Fontes oficiais de cotação e indicadores de FII (ADR-020), com dados sintéticos."""

from datetime import date
from decimal import Decimal

from financeiro.market_data.adapters.brapi import ler_preco
from financeiro.market_data.adapters.cotahist import Fechamento, ler_cotahist
from financeiro.market_data.adapters.cvm_informe_mensal import informes_por_cnpj, isin_para_cnpj
from financeiro.market_data.domain.indicadores import (
    InformeMensal,
    dy_12m_percentual,
    pvp,
    rendimentos_12m,
)


def _registro_01(
    ticker: str, preult: int, voltot: int, isin: str, tpmerc: str = "010", fatcot: int = 1
) -> str:
    """Monta uma linha de 245 posições no layout da B3 (posições 1-based)."""
    linha = [" "] * 245

    def por(inicio: int, texto: str) -> None:
        linha[inicio - 1 : inicio - 1 + len(texto)] = list(texto)

    por(1, "01")
    por(3, "20261104")
    por(11, "12")
    por(13, ticker.ljust(12))
    por(25, tpmerc)
    por(28, "FII FICTICIO")
    por(109, str(preult).zfill(13))
    por(171, str(voltot).zfill(18))
    por(211, str(fatcot).zfill(7))
    por(231, isin)
    return "".join(linha)


def test_cotahist_le_fechamento_volume_e_isin_so_do_mercado_a_vista() -> None:
    texto = "\n".join(
        [
            "00COTAHIST.2026BOVESPA 20261104".ljust(245),
            _registro_01("FICT11", 1023, 123456789, "BRFICTCTF000"),
            _registro_01("FICT11", 999, 1, "BRFICTCTF000", tpmerc="020"),  # fracionário
            _registro_01("OUTRO11", 500, 1, "BROUTRCTF000"),
            "99COTAHIST.2026BOVESPA 20261104".ljust(245),
        ]
    )
    assert ler_cotahist(texto, {"FICT11"}) == {
        "FICT11": Fechamento(
            ticker="FICT11",
            pregao=date(2026, 11, 4),
            preco=Decimal("10.23"),
            volume=Decimal("1234567.89"),
            isin="BRFICTCTF000",
        )
    }


def test_cotahist_divide_pelo_fator_de_cotacao() -> None:
    texto = _registro_01("LOTE11", 100000, 0, "BRLOTECTF000", fatcot=1000)
    assert ler_cotahist(texto, {"LOTE11"})["LOTE11"].preco == Decimal("1")


GERAL = (
    "Tipo_Fundo_Classe;CNPJ_Fundo_Classe;Data_Referencia;Versao;Codigo_ISIN\n"
    "Classe;00.000.000/0001-00;2026-08-01;1;BRFICTCTF000\n"
    "Classe;11.111.111/0001-11;2026-09-01;2;BRFICTCTF000\n"
    "Classe;22.222.222/0001-22;2026-09-01;1;\n"
)


def test_isin_aponta_para_o_cnpj_do_informe_mais_recente() -> None:
    assert isin_para_cnpj(GERAL) == {"BRFICTCTF000": "11.111.111/0001-11"}


COMPLEMENTO = (
    "CNPJ_Fundo_Classe;Data_Referencia;Versao;Valor_Patrimonial_Cotas;Percentual_Dividend_Yield_Mes\n"
    "11.111.111/0001-11;2026-09-01;1;10.00;0.01\n"
    "11.111.111/0001-11;2026-09-01;2;10.50;0.0095\n"
    "11.111.111/0001-11;2026-08-01;1;10.20;0.0098\n"
    "99.999.999/0001-99;2026-09-01;1;50.00;0.02\n"
)


def test_complemento_fica_com_a_maior_versao_de_cada_mes() -> None:
    assert informes_por_cnpj(COMPLEMENTO, {"11.111.111/0001-11"}) == {
        "11.111.111/0001-11": [
            InformeMensal(date(2026, 8, 1), Decimal("10.20"), Decimal("0.0098")),
            InformeMensal(date(2026, 9, 1), Decimal("10.50"), Decimal("0.0095")),
        ]
    }


def _treze_meses(vp: str = "10", dy: str = "0.01") -> list[InformeMensal]:
    meses = [date(2025, m, 1) for m in range(9, 13)] + [date(2026, m, 1) for m in range(1, 10)]
    return [InformeMensal(m, Decimal(vp), Decimal(dy)) for m in meses]


def test_dy_12m_soma_doze_rendimentos_sobre_o_preco() -> None:
    informes = _treze_meses()
    # 12 meses x (1 % x R$ 10,00) = R$ 1,20 por cota; sobre R$ 8,00 = 15 %.
    assert rendimentos_12m(informes) == Decimal("1.20")
    assert dy_12m_percentual(Decimal("8.00"), informes) == Decimal("15.0000")


def test_dy_12m_sem_treze_meses_seguidos_fica_vazio_em_vez_de_inventar() -> None:
    falha = [i for i in _treze_meses() if i.referencia != date(2026, 3, 1)]
    assert dy_12m_percentual(Decimal("8"), falha) is None
    assert dy_12m_percentual(Decimal("8"), _treze_meses()[1:]) is None


def test_pvp_usa_o_vp_do_informe_mais_recente() -> None:
    informes = [
        *_treze_meses(vp="10"),
        InformeMensal(date(2026, 10, 1), Decimal("9.60"), Decimal(0)),
    ]
    assert pvp(Decimal("8.64"), informes) == Decimal("0.9000")
    assert pvp(Decimal("8.64"), []) is None


def test_brapi_le_o_preco_e_recusa_resposta_sem_preco() -> None:
    assert ler_preco('{"results":[{"symbol":"FICT11","regularMarketPrice":10.23}]}') == Decimal(
        "10.23"
    )
    assert ler_preco('{"error":true,"code":"MISSING_TOKEN"}') is None
    assert ler_preco('{"results":[{"regularMarketPrice":null}]}') is None
    assert ler_preco("não é json") is None
