"""`RepositorioDeUsuarios` sobre as funções da migration 001."""

from dataclasses import dataclass
from uuid import UUID

from financeiro.identity.domain.usuario import UsuarioApp
from financeiro.shared.adapters.postgres import TransacaoPsycopg


@dataclass(slots=True)
class RepositorioDeUsuariosPsycopg:
    """Lê `app_users` pelas funções SECURITY DEFINER da migration 001.

    `resolver_por_email` e `id_do_demo` existem como função no banco, e não
    como SELECT direto, porque precisam rodar antes de haver `app.user_id`: a
    policy de `app_users` depende justamente dele (ADR-003).
    """

    transacao: TransacaoPsycopg

    def resolver_por_email(self, email: str) -> UUID | None:
        linha = self.transacao.um("SELECT resolve_app_user(%s)", (email,))
        return _uuid_ou_nulo(linha)

    def id_do_demo(self) -> UUID | None:
        linha = self.transacao.um("SELECT demo_app_user()")
        return _uuid_ou_nulo(linha)

    def carregar(self, user_id: UUID) -> UsuarioApp | None:
        """Carrega a linha do usuário, fixando o contexto para poder lê-la.

        O `set_config` aqui não é detalhe de otimização: sem ele este método é
        quebrado. A policy de `app_users` só mostra a linha cujo `id` é igual a
        `current_app_user()`, e no momento do login a transação ainda não tem
        `app.user_id` — então a consulta voltava vazia, o login do dono caía no
        demo e o próprio demo falhava em carregar. Como o papel `owner` é
        superusuário no Docker, os testes passavam.

        O contexto é definido **apenas se ainda não houver um**. A diferença não
        é sutil: definir incondicionalmente deixaria `carregar(outro_id)` ler a
        linha de qualquer pessoa, bastando reapontar o contexto para ela — e
        ainda trocaria o usuário da transação em curso. Seria o mesmo vazamento
        de uma função SECURITY DEFINER que devolvesse a linha de qualquer id,
        que foi recusada justamente por isso.

        Com o `coalesce`, o login (contexto vazio) carrega quem acabou de ser
        autenticado, e uma sessão já estabelecida continua sujeita à RLS: pedir
        a linha de outro devolve nada.
        """
        self.transacao.executar(
            "SELECT set_config("
            "    'app.user_id',"
            "    coalesce(nullif(current_setting('app.user_id', true), ''), %s),"
            "    true"
            ")",
            (str(user_id),),
        )
        linha = self.transacao.um(
            "SELECT id, email, display_name, is_demo FROM app_users WHERE id = %s",
            (user_id,),
        )
        if linha is None:
            return None

        identificador, email, display_name, is_demo = linha
        assert isinstance(identificador, UUID)
        assert isinstance(email, str)
        assert isinstance(display_name, str)
        assert isinstance(is_demo, bool)
        return UsuarioApp(id=identificador, email=email, display_name=display_name, is_demo=is_demo)


def _uuid_ou_nulo(linha: tuple[object, ...] | None) -> UUID | None:
    if linha is None or linha[0] is None:
        return None
    valor = linha[0]
    assert isinstance(valor, UUID), f"esperava uuid, veio {valor!r}"
    return valor
