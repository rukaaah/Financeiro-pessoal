"""Leitura das claims do `st.user`, sem Streamlit no caminho."""

from typing import Any

import pytest

from financeiro.identity.adapters.streamlit_oidc import credenciais_de


class UsuarioFalso:
    """Imita o objeto de claims do Streamlit."""

    def __init__(self, **claims: Any) -> None:
        self.__dict__.update(claims)


def test_usuario_ausente_vira_anonimo() -> None:
    assert credenciais_de(None).email is None


def test_nao_logado_vira_anonimo() -> None:
    credenciais = credenciais_de(UsuarioFalso(is_logged_in=False, email="a@b.com"))
    assert credenciais.email is None
    assert credenciais.email_verificado is False


def test_logado_e_verificado() -> None:
    credenciais = credenciais_de(
        UsuarioFalso(is_logged_in=True, email="a@b.com", email_verified=True, name="A")
    )
    assert credenciais == type(credenciais)("a@b.com", True, "A")


@pytest.mark.parametrize("valor", [None, False, "true", 1, "yes"])
def test_qualquer_coisa_que_nao_seja_true_conta_como_nao_verificado(valor: object) -> None:
    """A string 'true' não é True. Aceitar aproximação aqui seria aceitar e-mail alheio."""
    credenciais = credenciais_de(
        UsuarioFalso(is_logged_in=True, email="a@b.com", email_verified=valor)
    )
    assert credenciais.email_verificado is False


def test_claims_em_mapeamento_tambem_funcionam() -> None:
    credenciais = credenciais_de(
        {"is_logged_in": True, "email": "a@b.com", "email_verified": True, "name": "A"}
    )
    assert credenciais.email == "a@b.com"
    assert credenciais.email_verificado is True
