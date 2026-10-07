"""A porta da unidade de trabalho.

Mora em `shared`, e não em `identity`, por uma razão de fronteira: todo módulo
precisa de transação, e se a unidade de trabalho morasse em `identity`, cada um
deles passaria a importar `identity`. O contrato de independência entre módulos
(ADR-001, verificado por import-linter) quebraria. `shared` é o único módulo que
os outros podem importar.
"""

from collections.abc import Iterator
from typing import Protocol
from uuid import UUID


class Transacao(Protocol):
    """O que um caso de uso pode fazer dentro de uma transação."""

    def executar(self, sql: str, parametros: tuple[object, ...] = ()) -> None: ...

    def um(self, sql: str, parametros: tuple[object, ...] = ()) -> tuple[object, ...] | None:
        """Primeira linha do resultado, ou None."""
        ...

    def todos(self, sql: str, parametros: tuple[object, ...] = ()) -> list[tuple[object, ...]]: ...


class UnidadeDeTrabalho(Protocol):
    """Abre transações já amarradas a um usuário.

    Quem implementa é responsável por definir `app.user_id` **antes** de
    qualquer comando, em toda transação, sem exceção (ADR-004). Nenhum caso de
    uso deve precisar lembrar disso.
    """

    def transacao(self, user_id: UUID) -> Iterator[Transacao]:
        """Context manager: commita ao sair bem, reverte em qualquer exceção."""
        ...
