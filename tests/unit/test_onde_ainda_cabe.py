"""Regras do Resumo para categorias (decisões do Pedro em 2026-10-29).

- "Onde ainda cabe" só mostra dinheiro do mês de fato livre.
- Categoria com cofrinho (Jogos) tem três modalidades: para o cofrinho, do
  cofrinho e do salário. Só o que sai do salário além da inserção prevista
  aparece no Resumo.
"""

from datetime import date
from decimal import Decimal

from app.alertas import onde_ainda_cabe, pendencias
from app.modelos import LinhaDeOrcamento


def _linha(
    categoria: str, previsto: str, realizado: str, natureza: str = "variável"
) -> LinhaDeOrcamento:
    return LinhaDeOrcamento(
        "G", categoria, Decimal(previsto), Decimal(realizado), natureza=natureza
    )


def _jogos(para_cofrinho: str, do_cofrinho: str, do_salario: str) -> LinhaDeOrcamento:
    return LinhaDeOrcamento(
        "Lazer",
        "Jogos",
        previsto=Decimal("150"),
        realizado=Decimal(do_cofrinho) + Decimal(do_salario),
        financiado_por_cofrinho=Decimal(do_cofrinho),
        natureza="cofrinho",
        cofrinho="Jogos",
        para_cofrinho=Decimal(para_cofrinho),
    )


def test_so_variavel_com_folga_e_em_ordem_de_folga() -> None:
    orcamento = [
        _linha("Pouca folga", "100", "90"),
        _linha("Muita folga", "200", "50"),
        _linha("Estourada", "100", "130"),
        _linha("Zerada", "80", "80"),
        _linha("Muay thai", "150", "0", natureza="fixa"),
        _jogos("150", "40", "0"),
    ]
    assert [linha.categoria for linha in onde_ainda_cabe(orcamento)] == [
        "Muita folga",
        "Pouca folga",
    ]


def _alertas_de_jogos(linha: LinhaDeOrcamento) -> list[str]:
    itens = pendencias(date(2026, 10, 15), [linha], [], [], [], 11)
    return [a.titulo for a in itens]


def test_insercao_prevista_e_gasto_do_cofrinho_nao_aparecem() -> None:
    assert _alertas_de_jogos(_jogos("150", "157.50", "0")) == []


def test_gasto_direto_do_salario_aparece() -> None:
    linha = _jogos("150", "0", "80")
    assert linha.fora_do_previsto == Decimal("80")
    assert _alertas_de_jogos(linha) == ["Jogos usou dinheiro do mês"]


def test_insercao_acima_da_prevista_aparece() -> None:
    assert _jogos("200", "0", "0").fora_do_previsto == Decimal("50")
