"""Conexão com o Postgres local para os testes de integração.

Os testes rodam contra o banco do `docker-compose.yml`, com as migrations já
aplicadas. Sem banco acessível, a suíte inteira é pulada em vez de falhar: quem
roda só os testes unitários não precisa de Docker.
"""

import os
from collections.abc import Iterator

import psycopg
import pytest

URL_PADRAO = "postgresql://owner:dev@localhost:5433/financeiro"


def _url() -> str:
    """URL de conexão, aceitando também o scheme que o yoyo usa."""
    url = os.environ.get("DATABASE_URL", URL_PADRAO)
    return url.replace("postgresql+psycopg://", "postgresql://")


@pytest.fixture(scope="session")
def url_do_banco() -> str:
    url = _url()
    try:
        with psycopg.connect(url, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('app_users')")
            linha = cur.fetchone()
            if linha is None or linha[0] is None:
                pytest.skip("migrations não aplicadas: rode `uv run yoyo apply`")
    except psycopg.OperationalError as erro:
        pytest.skip(f"Postgres indisponível ({erro.__class__.__name__}): docker compose up -d")
    return url


@pytest.fixture
def conn(url_do_banco: str) -> Iterator[psycopg.Connection[tuple[object, ...]]]:
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
