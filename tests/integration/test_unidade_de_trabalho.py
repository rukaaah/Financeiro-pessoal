"""A unidade de trabalho amarra usuário e transação de verdade?

O ADR-004 faz uma promessa específica: o pool pode ser compartilhado entre
sessões de usuários diferentes porque o `app.user_id` morre no fim de cada
transação. Estes testes forçam o pior caso — pool de **uma única conexão**, de
modo que o segundo usuário necessariamente herda a conexão física do primeiro.
"""

import uuid
from collections.abc import Iterator
from decimal import Decimal

import psycopg
import pytest
from psycopg_pool import ConnectionPool

from financeiro.identity.adapters.repositorio_psycopg import RepositorioDeUsuariosPsycopg
from financeiro.identity.application.resolver_sessao import (
    DemoIndisponivel,
    resolver_sessao,
)
from financeiro.identity.domain.usuario import Credenciais, ModoDeAcesso
from financeiro.shared.adapters.postgres import UnidadeDeTrabalhoPsycopg, criar_pool

pytestmark = pytest.mark.integration


@pytest.fixture
def pool_de_uma_conexao(url_como_app: str) -> Iterator[ConnectionPool]:
    """Pool com no máximo uma conexão.

    Não é economia: é o que garante que duas transações seguidas usem a mesma
    conexão física. Se o `app.user_id` vazasse, vazaria aqui.
    """
    pool = criar_pool(url_como_app, minimo=1, maximo=1)
    try:
        yield pool
    finally:
        pool.close()


@pytest.fixture
def dois_usuarios(url_do_banco: str) -> Iterator[tuple[uuid.UUID, uuid.UUID]]:
    """Dois usuários reais, com um lançamento cada, removidos no fim.

    Estes dados precisam estar commitados: o pool do `app` é outra conexão e
    não enxergaria uma transação ainda aberta.
    """
    a, b = uuid.uuid4(), uuid.uuid4()
    with psycopg.connect(url_do_banco, autocommit=True) as conexao:
        with conexao.cursor() as cur:
            for usuario, nome in ((a, "Usuária A"), (b, "Usuário B")):
                cur.execute(
                    "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, %s)",
                    (usuario, f"{usuario}@exemplo.com", nome),
                )
                conta = uuid.uuid4()
                cur.execute(
                    "INSERT INTO accounts (id, user_id, name, kind)"
                    " VALUES (%s, %s, 'PicPay', 'checking')",
                    (conta, usuario),
                )
                grupo, categoria = uuid.uuid4(), uuid.uuid4()
                cur.execute(
                    "INSERT INTO category_groups (id, user_id, name) VALUES (%s, %s, %s)",
                    (grupo, usuario, "Essenciais"),
                )
                cur.execute(
                    "INSERT INTO categories (id, user_id, group_id, name, kind)"
                    " VALUES (%s, %s, %s, 'Mercado', 'expense')",
                    (categoria, usuario, grupo),
                )
                cur.execute(
                    "INSERT INTO transactions"
                    " (user_id, kind, account_id, category_id, amount, occurred_on)"
                    " VALUES (%s, 'expense', %s, %s, %s, '2026-03-10')",
                    (usuario, conta, categoria, Decimal("-10.00")),
                )
        try:
            yield a, b
        finally:
            with conexao.cursor() as cur:
                cur.execute("DELETE FROM app_users WHERE id = ANY(%s)", ([a, b],))


def test_a_transacao_ja_nasce_com_o_usuario_definido(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao(a) as t:
        assert t.um("SELECT current_app_user()") == (a,)


def test_pool_compartilhado_nao_vaza_usuario_entre_transacoes(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """A promessa do ADR-004, na mesma conexão física."""
    a, b = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)

    with uow.transacao(a) as t:
        assert t.um("SELECT current_app_user()") == (a,)
        assert t.um("SELECT count(*) FROM transactions") == (1,)

    with uow.transacao(b) as t:
        assert t.um("SELECT current_app_user()") == (b,), "o usuário anterior vazou"
        assert t.um("SELECT count(*) FROM transactions WHERE user_id = %s", (a,)) == (0,)
        assert t.um("SELECT count(*) FROM transactions") == (1,)


def test_fora_de_qualquer_transacao_a_conexao_nao_tem_usuario(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """Depois que a transação fecha, a conexão volta limpa para o pool.

    Este é o teste que de fato protege o `is_local => true`, e não o do pool
    compartilhado acima — verificado trocando `true` por `false`: só este
    falhou. Faz sentido, porque a transação seguinte da unidade de trabalho
    sobrescreve o valor de qualquer maneira. O escopo local importa para quem
    pegar uma conexão do pool **fora** de uma transação nossa: aí um valor
    grudado seria o de outra pessoa.
    """
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao(a) as t:
        assert t.um("SELECT current_app_user()") == (a,)

    with pool_de_uma_conexao.connection() as conexao, conexao.cursor() as cur:
        cur.execute("SELECT current_app_user()")
        assert cur.fetchone() == (None,)


def test_excecao_reverte_a_transacao_inteira(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)

    class ErroDoCasoDeUso(Exception):
        pass

    with pytest.raises(ErroDoCasoDeUso), uow.transacao(a) as t:
        t.executar("INSERT INTO counterparties (user_id, name) VALUES (%s, 'Fulana')", (a,))
        raise ErroDoCasoDeUso

    with uow.transacao(a) as t:
        assert t.um("SELECT count(*) FROM counterparties") == (0,)


def test_sucesso_commita(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)

    with uow.transacao(a) as t:
        t.executar("INSERT INTO counterparties (user_id, name) VALUES (%s, 'Fulana')", (a,))

    with uow.transacao(a) as t:
        assert t.um("SELECT count(*) FROM counterparties") == (1,)


# ------------------------------------------- repositório e caso de uso


def test_repositorio_resolve_email_da_allowlist(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao(a) as t:
        repositorio = RepositorioDeUsuariosPsycopg(t)
        assert repositorio.resolver_por_email(f"{a}@exemplo.com") == a
        assert repositorio.resolver_por_email("ninguem@exemplo.com") is None


@pytest.fixture
def usuario_demo(url_do_banco: str) -> Iterator[uuid.UUID]:
    """Um usuário demo commitado, destino de quem está fora da allowlist."""
    demo = uuid.uuid4()
    with psycopg.connect(url_do_banco, autocommit=True) as conexao:
        with conexao.cursor() as cur:
            cur.execute("DELETE FROM app_users WHERE is_demo")
            cur.execute(
                "INSERT INTO app_users (id, email, display_name, is_demo)"
                " VALUES (%s, %s, 'Visitante', true)",
                (demo, f"{demo}@exemplo.com"),
            )
        try:
            yield demo
        finally:
            with conexao.cursor() as cur:
                cur.execute("DELETE FROM app_users WHERE id = %s", (demo,))


def test_sessao_de_dono_pelo_caminho_do_login(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """O caminho real: `transacao_sem_usuario`, como o app faz antes de saber quem é.

    Este é o teste que faltava. O que existia usava `transacao(a)`, que já fixa
    o `app.user_id` — então exercitava um caminho que o login nunca percorre, e
    não via que `carregar()` dependia de um contexto ainda inexistente.
    """
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao_sem_usuario() as t:
        sessao = resolver_sessao(
            Credenciais(f"{a}@exemplo.com".upper(), True),
            RepositorioDeUsuariosPsycopg(t),
        )
    assert sessao.modo is ModoDeAcesso.DONO
    assert sessao.usuario.id == a


def test_sessao_de_demo_pelo_caminho_do_login(
    pool_de_uma_conexao: ConnectionPool, usuario_demo: uuid.UUID
) -> None:
    """Quem está fora da allowlist precisa conseguir carregar o demo."""
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao_sem_usuario() as t:
        sessao = resolver_sessao(
            Credenciais("desconhecida@exemplo.com", True),
            RepositorioDeUsuariosPsycopg(t),
        )
    assert sessao.modo is ModoDeAcesso.DEMO
    assert sessao.usuario.id == usuario_demo
    assert sessao.mostrar_faixa_de_dados_ficticios


def test_carregar_nao_alcanca_a_linha_de_outro_usuario(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """A correção fixa o contexto com o próprio id, então segue valendo a RLS.

    Importa justamente porque a alternativa recusada — uma função SECURITY
    DEFINER devolvendo a linha de qualquer id — passaria neste cenário e
    exporia o e-mail de quem tivesse o uuid adivinhado.
    """
    a, b = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao(a) as t:
        repositorio = RepositorioDeUsuariosPsycopg(t)
        assert repositorio.carregar(a) is not None
        assert repositorio.carregar(b) is None


def test_sem_demo_cadastrado_o_visitante_e_recusado_em_vez_de_entrar_sem_contexto(
    pool_de_uma_conexao: ConnectionPool, dois_usuarios: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """Não há usuário demo neste banco de teste, então é o caminho de erro."""
    a, _ = dois_usuarios
    uow = UnidadeDeTrabalhoPsycopg(pool_de_uma_conexao)
    with uow.transacao(a) as t, pytest.raises(DemoIndisponivel):
        resolver_sessao(
            Credenciais("desconhecida@exemplo.com", True),
            RepositorioDeUsuariosPsycopg(t),
        )
