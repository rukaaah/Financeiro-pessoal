"""Garante que o esqueleto de módulos e camadas do ADR-001 existe e importa."""

import importlib

import pytest

MODULOS = (
    "ledger",
    "budgeting",
    "cards",
    "goals",
    "investments",
    "market_data",
    "importing",
    "categorization",
    "identity",
    "shared",
)

CAMADAS = ("domain", "application", "adapters")


@pytest.mark.parametrize("modulo", MODULOS)
@pytest.mark.parametrize("camada", CAMADAS)
def test_cada_modulo_tem_as_tres_camadas(modulo: str, camada: str) -> None:
    importlib.import_module(f"financeiro.{modulo}.{camada}")
