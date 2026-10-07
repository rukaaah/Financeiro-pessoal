"""Portas de que os casos de uso de identidade precisam.

Declaradas como Protocol: a camada de aplicação descreve o que precisa, e os
adapters é que sabem falar com o Postgres (ADR-001).
"""

from typing import Protocol
from uuid import UUID

from financeiro.identity.domain.usuario import UsuarioApp


class RepositorioDeUsuarios(Protocol):
    """Acesso de leitura a `app_users`.

    As duas primeiras operações rodam **antes** de haver `app.user_id` na
    transação, então no Postgres elas são funções SECURITY DEFINER (migration
    001). A terceira já roda com o contexto definido.
    """

    def resolver_por_email(self, email: str) -> UUID | None:
        """Id do usuário ativo com este e-mail, ou None se não está na allowlist."""
        ...

    def id_do_demo(self) -> UUID | None:
        """Id do usuário demo ativo, ou None se não houver nenhum configurado."""
        ...

    def carregar(self, user_id: UUID) -> UsuarioApp | None:
        """Dados do usuário, já dentro de uma transação com `app.user_id` definido."""
        ...
