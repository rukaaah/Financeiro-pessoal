"""Os dados de exemplo da pré-visualização obedecem às regras de negócio?

Enquanto `app.dados` devolve números de exemplo, este teste garante que o exemplo
não ensina nada errado (fechamento inclusivo, Decimal, soma zero).
"""

from datetime import date
from decimal import Decimal

from app import dados
from app.formatacao import ler_valor
from app.modelos import Estado, estado_do_gasto
from app.validacoes import intervalo_plausivel

MES = date(2026, 10, 1)


def test_fechamento_e_inclusivo() -> None:
    assert dados.mes_da_fatura(4, 11, date(2026, 10, 4)) == date(2026, 10, 1)
    assert dados.mes_da_fatura(4, 11, date(2026, 10, 5)) == date(2026, 11, 1)


def test_vencimento_menor_que_fechamento_cai_no_mes_seguinte() -> None:
    assert dados.mes_da_fatura(27, 5, date(2026, 10, 27)) == date(2026, 11, 1)


def test_parcela_cai_na_fatura_seguinte() -> None:
    assert dados.mes_da_fatura(4, 11, date(2026, 10, 4), parcela=2) == date(2026, 11, 1)


def test_valores_do_exemplo_sao_decimal() -> None:
    resumo = dados.resumo_do_mes(MES)
    for valor in (resumo.renda_real, resumo.gasto, resumo.guardado, resumo.sobra):
        assert isinstance(valor, Decimal)
    for linha in dados.orcamento_do_mes(MES):
        assert isinstance(linha.previsto, Decimal)
        assert isinstance(linha.realizado, Decimal)


def test_sobra_e_renda_menos_gasto_menos_guardado() -> None:
    resumo = dados.resumo_do_mes(MES)
    assert resumo.sobra == resumo.renda_real - resumo.gasto - resumo.guardado


def test_estado_do_gasto() -> None:
    assert estado_do_gasto(Decimal(50), Decimal(100)) is Estado.OK
    assert estado_do_gasto(Decimal(95), Decimal(100)) is Estado.ATENCAO
    assert estado_do_gasto(Decimal(101), Decimal(100)) is Estado.ESTOUROU
    assert estado_do_gasto(Decimal(1), Decimal(0)) is Estado.ESTOUROU


def test_ler_valor_aceita_virgula_e_rejeita_o_resto() -> None:
    assert ler_valor("1.234,50") == Decimal("1234.50")
    assert ler_valor("12,5") == Decimal("12.5")
    assert ler_valor("0") is None
    assert ler_valor("-3") is None
    assert ler_valor("abc") is None
    assert ler_valor("") is None


def test_termos_do_exemplo_tem_intervalo_plausivel() -> None:
    for termos in dados.termos_dos_cartoes():
        assert intervalo_plausivel(termos.fechamento, termos.vencimento)


def test_projecao_cresce_e_nao_usa_float() -> None:
    pontos = dados.projetar(dados.premissas_padrao(), 24)
    assert pontos[0].meses == 0
    assert pontos[-1].meses == 24
    assert pontos[-1].patrimonio > pontos[0].patrimonio
    assert isinstance(pontos[-1].renda_mensal, Decimal)


def test_exemplos_de_mercado_nao_usam_tickers_reais() -> None:
    assert {f.ticker for f in dados.fiis()} <= {"DEMO11", "TESTE11", "EXEMP11"}
