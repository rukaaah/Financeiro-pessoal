"""Regras de identidade que não dependem de banco nem de framework.

A decisão central do ADR-003 mora aqui: um e-mail só vale alguma coisa se o
provedor afirmou que o verificou.
"""

from dataclasses import dataclass
from enum import Enum
from uuid import UUID


class ModoDeAcesso(Enum):
    """Como a sessão foi resolvida.

    Não é um nível de permissão: o isolamento é o mesmo nos dois casos, feito
    pela RLS a partir do `user_id` (ADR-004). Serve para a interface saber se
    deve mostrar a faixa "Dados fictícios".
    """

    DONO = "dono"
    DEMO = "demo"


@dataclass(frozen=True, slots=True)
class Credenciais:
    """O que o provedor OIDC afirmou sobre quem está entrando.

    `email_verificado` vem do provedor e não é opinião nossa. Um e-mail não
    verificado é tão útil quanto nenhum: qualquer pessoa poderia declarar o
    endereço de outra.
    """

    email: str | None
    email_verificado: bool
    nome: str | None = None


@dataclass(frozen=True, slots=True)
class UsuarioApp:
    """Uma linha de `app_users` já carregada."""

    id: UUID
    email: str
    display_name: str
    is_demo: bool


@dataclass(frozen=True, slots=True)
class Sessao:
    """O resultado de resolver quem está usando o sistema."""

    usuario: UsuarioApp
    modo: ModoDeAcesso

    @property
    def mostrar_faixa_de_dados_ficticios(self) -> bool:
        return self.modo is ModoDeAcesso.DEMO


def email_confiavel(credenciais: Credenciais) -> str | None:
    """O e-mail que podemos usar na allowlist, ou None.

    Normaliza para minúsculas porque é assim que `app_users.email` é guardado
    (CHECK na migration 001). Espaços em volta são do transporte, não do
    endereço, e são removidos.
    """
    if not credenciais.email_verificado:
        return None
    if credenciais.email is None:
        return None

    email = credenciais.email.strip().lower()
    return email or None
