"""Traduz o que o `st.login` deixou em `st.user` para `Credenciais`.

Isolado num adapter para que a regra do ADR-003 (só e-mail verificado conta)
possa ser testada sem Streamlit no caminho.
"""

from typing import Any

from financeiro.identity.domain.usuario import Credenciais

ANONIMO = Credenciais(email=None, email_verificado=False, nome=None)


def credenciais_de(usuario: Any) -> Credenciais:
    """Lê as claims de um objeto no formato de `st.user`.

    Recebe `Any` porque `st.user` não é uma classe estável que se possa tipar:
    é um objeto de claims variável conforme o provedor. A conversão para um
    tipo nosso acontece aqui, e nada além deste arquivo vê a forma original.

    Quem não está logado vira credencial anônima, não erro: visita sem login é
    o caminho normal num app público e termina em modo demo.
    """
    if usuario is None:
        return ANONIMO

    if not _claim(usuario, "is_logged_in"):
        return ANONIMO

    email = _claim(usuario, "email")
    verificado = _claim(usuario, "email_verified")
    nome = _claim(usuario, "name")

    return Credenciais(
        email=email if isinstance(email, str) else None,
        # Só `True` vale. Provedor que não envia a claim não teve o e-mail
        # verificado por nós, e tratar a ausência como verdadeira seria
        # aceitar endereço não comprovado.
        email_verificado=verificado is True,
        nome=nome if isinstance(nome, str) else None,
    )


def _claim(usuario: Any, nome: str) -> object:
    """Lê uma claim, tanto de objeto quanto de mapeamento."""
    try:
        if hasattr(usuario, nome):
            return getattr(usuario, nome)
        if hasattr(usuario, "get"):
            return usuario.get(nome)
    except (AttributeError, KeyError, TypeError):
        return None
    return None
