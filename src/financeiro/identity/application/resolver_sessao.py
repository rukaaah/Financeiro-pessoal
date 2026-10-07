"""Caso de uso: descobrir quem está usando o sistema.

É o ponto único onde a decisão dono/demo do ADR-003 acontece. Dali para dentro
ninguém mais sabe a diferença: o resto do sistema recebe apenas um `user_id`, e
o isolamento é o mesmo mecanismo de RLS nos dois casos.
"""

from financeiro.identity.application.ports import RepositorioDeUsuarios
from financeiro.identity.domain.usuario import (
    Credenciais,
    ModoDeAcesso,
    Sessao,
    email_confiavel,
)


class DemoIndisponivel(RuntimeError):
    """Não há usuário demo ativo para receber quem está fora da allowlist.

    É erro de configuração, não de uso. Falha alto de propósito: a alternativa
    seria deixar o visitante entrar sem contexto de usuário, e aí qualquer
    consulta voltaria vazia sem explicação.
    """


def resolver_sessao(credenciais: Credenciais, repositorio: RepositorioDeUsuarios) -> Sessao:
    """Credenciais do provedor OIDC -> sessão de dono ou de demo.

    Cair no demo é o caminho normal, não exceção: o app é público (ADR-002) e a
    maioria das visitas não está na allowlist.
    """
    email = email_confiavel(credenciais)

    if email is not None:
        user_id = repositorio.resolver_por_email(email)
        if user_id is not None:
            usuario = repositorio.carregar(user_id)
            if usuario is not None:
                return Sessao(usuario=usuario, modo=ModoDeAcesso.DONO)

    id_demo = repositorio.id_do_demo()
    if id_demo is None:
        raise DemoIndisponivel(
            "Nenhum usuário demo ativo em app_users: quem está fora da "
            "allowlist não tem para onde ir."
        )

    demo = repositorio.carregar(id_demo)
    if demo is None:
        raise DemoIndisponivel(f"O usuário demo {id_demo} existe mas não pôde ser carregado.")

    return Sessao(usuario=demo, modo=ModoDeAcesso.DEMO)
