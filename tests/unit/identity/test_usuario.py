"""A regra do ADR-003: e-mail não verificado não vale nada."""

import uuid

import pytest

from financeiro.identity.domain.usuario import (
    Credenciais,
    ModoDeAcesso,
    Sessao,
    UsuarioApp,
    email_confiavel,
)


@pytest.mark.parametrize(
    ("credenciais", "esperado"),
    [
        (Credenciais("pessoa@exemplo.com", True), "pessoa@exemplo.com"),
        # Normaliza para minúsculas: é assim que app_users.email é guardado.
        (Credenciais("Pessoa@Exemplo.COM", True), "pessoa@exemplo.com"),
        (Credenciais("  pessoa@exemplo.com  ", True), "pessoa@exemplo.com"),
        # Não verificado: qualquer um poderia declarar o endereço de outra pessoa.
        (Credenciais("pessoa@exemplo.com", False), None),
        (Credenciais(None, True), None),
        (Credenciais(None, False), None),
        (Credenciais("", True), None),
        (Credenciais("   ", True), None),
    ],
)
def test_email_confiavel(credenciais: Credenciais, esperado: str | None) -> None:
    assert email_confiavel(credenciais) == esperado


def test_faixa_de_dados_ficticios_so_no_demo() -> None:
    usuario = UsuarioApp(uuid.uuid4(), "a@b.com", "Alguém", is_demo=False)
    assert Sessao(usuario, ModoDeAcesso.DONO).mostrar_faixa_de_dados_ficticios is False
    assert Sessao(usuario, ModoDeAcesso.DEMO).mostrar_faixa_de_dados_ficticios is True
