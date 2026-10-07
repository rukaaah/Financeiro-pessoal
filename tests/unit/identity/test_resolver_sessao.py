"""O roteamento dono/demo, exercitado com um fake do repositório.

Nenhum banco envolvido: o caso de uso conversa com a porta, e a porta tem uma
implementação em memória aqui (ADR-001).
"""

import uuid
from uuid import UUID

import pytest

from financeiro.identity.application.resolver_sessao import (
    DemoIndisponivel,
    resolver_sessao,
)
from financeiro.identity.domain.usuario import Credenciais, ModoDeAcesso, UsuarioApp

DONA = UsuarioApp(uuid.uuid4(), "dona@exemplo.com", "Dona", is_demo=False)
DEMO = UsuarioApp(uuid.uuid4(), "demo@exemplo.com", "Visitante", is_demo=True)


class RepositorioFake:
    """Implementação em memória da porta `RepositorioDeUsuarios`."""

    def __init__(self, *, usuarios: list[UsuarioApp], demo: UsuarioApp | None) -> None:
        self._por_id = {u.id: u for u in usuarios}
        self._demo = demo
        if demo is not None:
            self._por_id[demo.id] = demo

    def resolver_por_email(self, email: str) -> UUID | None:
        for usuario in self._por_id.values():
            if usuario.email == email and not usuario.is_demo:
                return usuario.id
        return None

    def id_do_demo(self) -> UUID | None:
        return self._demo.id if self._demo else None

    def carregar(self, user_id: UUID) -> UsuarioApp | None:
        return self._por_id.get(user_id)


@pytest.fixture
def repositorio() -> RepositorioFake:
    return RepositorioFake(usuarios=[DONA], demo=DEMO)


def test_email_verificado_na_allowlist_vira_sessao_de_dono(
    repositorio: RepositorioFake,
) -> None:
    sessao = resolver_sessao(Credenciais("dona@exemplo.com", True), repositorio)
    assert sessao.modo is ModoDeAcesso.DONO
    assert sessao.usuario == DONA


def test_caixa_do_email_nao_impede_o_reconhecimento(repositorio: RepositorioFake) -> None:
    sessao = resolver_sessao(Credenciais("DONA@Exemplo.com", True), repositorio)
    assert sessao.usuario == DONA


def test_email_nao_verificado_cai_no_demo(repositorio: RepositorioFake) -> None:
    """Mesmo sendo o e-mail da dona: sem verificação, não se confia nele."""
    sessao = resolver_sessao(Credenciais("dona@exemplo.com", False), repositorio)
    assert sessao.modo is ModoDeAcesso.DEMO
    assert sessao.usuario == DEMO


def test_fora_da_allowlist_cai_no_demo(repositorio: RepositorioFake) -> None:
    sessao = resolver_sessao(Credenciais("outra@exemplo.com", True), repositorio)
    assert sessao.modo is ModoDeAcesso.DEMO


def test_visita_sem_login_cai_no_demo(repositorio: RepositorioFake) -> None:
    sessao = resolver_sessao(Credenciais(None, False), repositorio)
    assert sessao.modo is ModoDeAcesso.DEMO


def test_sem_demo_configurado_falha_alto() -> None:
    """Deixar entrar sem contexto de usuário deixaria tudo vazio sem explicação."""
    repositorio = RepositorioFake(usuarios=[DONA], demo=None)
    with pytest.raises(DemoIndisponivel):
        resolver_sessao(Credenciais("ninguem@exemplo.com", True), repositorio)
