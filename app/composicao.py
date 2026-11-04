"""Raiz de composição: liga os adapters concretos aos casos de uso.

É o único lugar do app que conhece psycopg e Streamlit ao mesmo tempo. As
páginas recebem a sessão já resolvida e nunca tocam em pool nem em SQL.
"""

import os

import streamlit as st
from psycopg_pool import ConnectionPool

from financeiro.identity.adapters.repositorio_psycopg import (
    RepositorioDeUsuariosPsycopg,
)
from financeiro.identity.adapters.streamlit_oidc import credenciais_de
from financeiro.identity.application.resolver_sessao import resolver_sessao
from financeiro.identity.domain.usuario import Sessao
from financeiro.shared.adapters.postgres import UnidadeDeTrabalhoPsycopg, criar_pool

CHAVE_DA_SESSAO = "sessao"


def _url_do_banco() -> str:
    """URL de conexão: `DATABASE_URL` do ambiente, senão os secrets.

    A ordem importa e não é a óbvia. O Streamlit carrega
    `.streamlit/secrets.toml` sozinho, e na máquina de desenvolvimento esse
    arquivo aponta para a produção — então "secrets primeiro" fazia um
    `streamlit run` local conectar na produção sem avisar. Foi o que aconteceu
    aqui, num teste.

    Com o ambiente primeiro, quem exportou `DATABASE_URL` para o Postgres do
    Docker trabalha nele. Em produção não existe variável de ambiente, então os
    secrets continuam valendo, sem configuração extra.

    A URL nunca aparece em mensagem de erro nem em log: o repositório é público.
    """
    url = os.environ.get("DATABASE_URL", "")

    if not url:
        try:
            url = str(st.secrets["database"]["url"])
        except (KeyError, FileNotFoundError):
            url = ""

    if not url:
        raise RuntimeError(
            "Conexão com o banco não configurada: defina DATABASE_URL no "
            "ambiente ou [database].url nos secrets do Streamlit."
        )
    return url.replace("postgresql+psycopg://", "postgresql://")


@st.cache_resource
def pool_compartilhado() -> ConnectionPool:
    """Um pool para todo o app, reaproveitado entre sessões de usuários diferentes.

    Compartilhar é seguro porque a amarração entre conexão e usuário dura
    exatamente uma transação (ADR-004) — e há teste de integração forçando o
    pior caso, com pool de uma única conexão.
    """
    return criar_pool(_url_do_banco())


def unidade_de_trabalho() -> UnidadeDeTrabalhoPsycopg:
    return UnidadeDeTrabalhoPsycopg(pool_compartilhado())


def sessao_atual() -> Sessao:
    """Quem está usando o app, resolvido uma única vez por sessão do navegador.

    O resultado fica em `st.session_state`, nunca em variável de módulo: o pool
    é compartilhado entre usuários, o usuário não (ADR-004).
    """
    guardada = st.session_state.get(CHAVE_DA_SESSAO)
    if isinstance(guardada, Sessao):
        return guardada

    uow = unidade_de_trabalho()
    with uow.transacao_sem_usuario() as t:
        sessao = resolver_sessao(
            credenciais_de(getattr(st, "user", None)),
            RepositorioDeUsuariosPsycopg(t),
        )

    st.session_state[CHAVE_DA_SESSAO] = sessao
    return sessao


def esquecer_sessao() -> None:
    """Descarta a sessão resolvida, para que o próximo acesso recalcule."""
    st.session_state.pop(CHAVE_DA_SESSAO, None)
