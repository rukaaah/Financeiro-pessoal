"""Conexão com o Postgres local para os testes de integração.

Os testes rodam contra o banco do `docker-compose.yml`, com as migrations já
aplicadas. Sem banco acessível, a suíte inteira é pulada em vez de falhar: quem
roda só os testes unitários não precisa de Docker.
"""

import os
import uuid
from collections.abc import Iterator

import psycopg
import pytest

URL_PADRAO = "postgresql://owner:dev@localhost:5433/financeiro"

Conexao = psycopg.Connection[tuple[object, ...]]


def _url() -> str:
    """URL de conexão, aceitando também o scheme que o yoyo usa."""
    url = os.environ.get("DATABASE_URL", URL_PADRAO)
    return url.replace("postgresql+psycopg://", "postgresql://")


@pytest.fixture(scope="session")
def url_do_banco() -> str:
    url = _url()
    try:
        with psycopg.connect(url, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('transactions')")
            linha = cur.fetchone()
            if linha is None or linha[0] is None:
                pytest.skip("migrations não aplicadas: rode `uv run yoyo apply`")
    except psycopg.OperationalError as erro:
        pytest.skip(f"Postgres indisponível ({erro.__class__.__name__}): docker compose up -d")
    return url


@pytest.fixture
def conn(url_do_banco: str) -> Iterator[Conexao]:
    """Conexão como `owner`, sempre revertida no fim do teste.

    Cada teste roda dentro de uma transação que nunca é commitada, então o banco
    volta ao estado anterior sem precisar de limpeza manual.
    """
    with psycopg.connect(url_do_banco) as conexao:
        conexao.autocommit = False
        try:
            yield conexao
        finally:
            conexao.rollback()


def define_usuario(cur: psycopg.Cursor[tuple[object, ...]], user_id: uuid.UUID) -> None:
    """Equivalente a `SET LOCAL app.user_id`, mas parametrizável.

    `SET LOCAL` não aceita parâmetro vinculado, então interpolá-lo seria injeção
    de SQL. `set_config(..., is_local => true)` tem o mesmo efeito e aceita
    parâmetro. É esta a forma que a unit of work da T6 deve usar.
    """
    cur.execute("SELECT set_config('app.user_id', %s, true)", (str(user_id),))


def como_app(cur: psycopg.Cursor[tuple[object, ...]], user_id: uuid.UUID | None = None) -> None:
    """Passa a sessão para o papel `app`, opcionalmente com contexto de usuário.

    `app` não é superusuário nem dono das tabelas, então a RLS passa a valer sem
    precisar de senha.
    """
    cur.execute("SET LOCAL ROLE app")
    if user_id is not None:
        define_usuario(cur, user_id)
