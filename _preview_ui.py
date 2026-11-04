"""Pré-visualização local da UI, sem banco (TEMPORÁRIO, não commitar).

Troca a resolução de sessão por uma sessão simulada, para abrir as páginas
sem tocar em Neon nem em secrets. PREVIEW_DONO=1 simula o dono logado.
"""

import os
import runpy
import sys
import uuid
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "src"))

# Pré-visualização: descarta app.* a cada execução, para que editar um módulo
# apareça no próximo recarregamento sem reiniciar o servidor.
for _nome in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
    del sys.modules[_nome]

import app.composicao as composicao  # noqa: E402

from financeiro.identity.domain.usuario import ModoDeAcesso, Sessao, UsuarioApp  # noqa: E402

DONO = os.environ.get("PREVIEW_DONO") == "1"
_USUARIO = UsuarioApp(
    uuid.UUID(int=1),
    "dono@exemplo.com" if DONO else "demo@exemplo.com",
    "Dono" if DONO else "Visitante",
    not DONO,
)
_SESSAO = Sessao(_USUARIO, ModoDeAcesso.DONO if DONO else ModoDeAcesso.DEMO)

composicao.sessao_atual = lambda: _SESSAO

runpy.run_path(str(RAIZ / "streamlit_app.py"), run_name="__main__")
