"""As categorias base do demo (Python) e da primeira entrada (TypeScript) são as mesmas?

O demo é semeado por `scripts/seed_demo.py` e uma conta real nova ganha o conjunto
de `packages/dominio/src/categorias-base.ts`. Se um mudar sem o outro, o visitante
vê categorias que o dono não tem — nada quebra, só fica errado.
"""

import importlib.util
import re
import sys
from pathlib import Path
from types import ModuleType

RAIZ = Path(__file__).resolve().parents[2]
TS = RAIZ / "packages" / "dominio" / "src" / "categorias-base.ts"


def _carrega_seed() -> ModuleType:
    caminho = RAIZ / "scripts" / "seed_demo.py"
    spec = importlib.util.spec_from_file_location("seed_demo_unit", caminho)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    sys.modules["seed_demo_unit"] = modulo
    spec.loader.exec_module(modulo)
    return modulo


seed = _carrega_seed()
TEXTO = TS.read_text(encoding="utf-8")


def test_grupos_iguais_e_na_mesma_ordem() -> None:
    ts = [
        (nome, int(ordem))
        for nome, ordem in re.findall(r'\{ nome: "([^"]+)", ordem: (\d+) \}', TEXTO)
    ]
    py = [(nome, ordem) for _, nome, ordem in seed.GRUPOS]
    assert ts == py


def test_categorias_iguais() -> None:
    ts = re.findall(r'\{ grupo: "([^"]+)", nome: "([^"]+)", tipo: "(income|expense)" \}', TEXTO)
    nome_do_grupo = {chave: nome for chave, nome, _ in seed.GRUPOS}
    py = [(nome_do_grupo[grupo], nome, tipo) for _, nome, grupo, tipo in seed.CATEGORIAS]
    assert len(ts) == 15
    assert ts == py
