"""Unidade de trabalho sobre psycopg 3, com o `app.user_id` de cada transação.

O pool é compartilhado entre sessões de usuários diferentes (`st.cache_resource`),
então a amarração entre conexão e usuário precisa durar exatamente uma
transação. É o ponto em que o ADR-004 se concretiza.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID

import psycopg
from psycopg_pool import ConnectionPool

Linha = tuple[object, ...]


@dataclass(slots=True)
class TransacaoPsycopg:
    """Comandos dentro de uma transação já amarrada a um usuário."""

    _cursor: psycopg.Cursor[Linha]

    def executar(self, sql: str, parametros: tuple[object, ...] = ()) -> None:
        self._cursor.execute(sql, parametros)

    def um(self, sql: str, parametros: tuple[object, ...] = ()) -> Linha | None:
        self._cursor.execute(sql, parametros)
        return self._cursor.fetchone()

    def todos(self, sql: str, parametros: tuple[object, ...] = ()) -> list[Linha]:
        self._cursor.execute(sql, parametros)
        return self._cursor.fetchall()


def criar_pool(url: str, *, minimo: int = 1, maximo: int = 5) -> ConnectionPool:
    """Pool para o papel `app`.

    `open=False` mais `open()` explícito evita o aviso de abertura implícita do
    psycopg_pool e deixa o momento da conexão sob nosso controle — importante
    quando o Neon está hibernado e a primeira conexão demora.
    """
    pool = ConnectionPool(url, min_size=minimo, max_size=maximo, open=False)
    pool.open()
    return pool


@dataclass(slots=True)
class UnidadeDeTrabalhoPsycopg:
    """Implementação da porta `UnidadeDeTrabalho`."""

    pool: ConnectionPool

    @contextmanager
    def transacao(self, user_id: UUID) -> Iterator[TransacaoPsycopg]:
        """Abre uma transação com `app.user_id` fixado.

        Duas escolhas que não são óbvias:

        - `set_config(..., is_local => true)` em vez de `SET LOCAL app.user_id
          = ...`. O comando SET não aceita parâmetro vinculado, então a
          alternativa seria interpolar o uuid na string — injeção de SQL. O
          `is_local => true` dá exatamente o escopo de `SET LOCAL`: o valor
          morre no fim da transação e não volta ao pool grudado na conexão.
        - o `set_config` é o **primeiro** comando da transação, antes de
          qualquer coisa que o chamador peça. Um comando que escapasse antes
          dele rodaria sem contexto e, pela RLS, não enxergaria nada.
        """
        with (
            self.pool.connection() as conexao,
            conexao.transaction(),
            conexao.cursor() as cursor,
        ):
            cursor.execute("SELECT set_config('app.user_id', %s, true)", (str(user_id),))
            yield TransacaoPsycopg(cursor)
