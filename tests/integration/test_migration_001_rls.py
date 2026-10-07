"""A migration 001 isola usuários de verdade?

Estes testes são a prova executável do ADR-004. Eles não conferem que a policy
existe — conferem que ela impede o acesso. O papel `app` é assumido com
`SET LOCAL ROLE app`, que dispensa senha e mesmo assim sujeita a sessão à RLS,
porque `app` não é superusuário nem dono da tabela.
"""

import uuid

import psycopg
import pytest

from tests.integration.conftest import Conexao, como_app, define_usuario

pytestmark = pytest.mark.integration

ID_A = uuid.UUID("aaaaaaaa-1111-1111-1111-111111111111")
ID_B = uuid.UUID("bbbbbbbb-2222-2222-2222-222222222222")


@pytest.fixture
def dois_usuarios(conn: Conexao) -> None:
    """Insere dois usuários reais na transação do teste."""
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO app_users (id, email, display_name) VALUES (%s, %s, %s)",
            [
                (ID_A, "a@exemplo.com", "Usuária A"),
                (ID_B, "b@exemplo.com", "Usuário B"),
            ],
        )


def test_app_nao_tem_bypassrls(conn: Conexao) -> None:
    """Sem isso, nenhuma policy vale: o papel passaria por cima de todas."""
    with conn.cursor() as cur:
        cur.execute("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app'")
        assert cur.fetchone() == (False, False)


def test_rls_esta_habilitada_em_app_users(conn: Conexao) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT relrowsecurity FROM pg_class WHERE relname = 'app_users'")
        assert cur.fetchone() == (True,)


def test_sem_contexto_o_app_nao_ve_nada(conn: Conexao, dois_usuarios: None) -> None:
    """Esquecer o SET LOCAL devolve vazio, nunca dado de outra pessoa."""
    with conn.cursor() as cur:
        como_app(cur, None)
        cur.execute("SELECT count(*) FROM app_users")
        assert cur.fetchone() == (0,)


def test_com_contexto_o_app_ve_apenas_a_propria_linha(conn: Conexao, dois_usuarios: None) -> None:
    with conn.cursor() as cur:
        como_app(cur, ID_A)
        cur.execute("SELECT id FROM app_users")
        assert cur.fetchall() == [(ID_A,)]


def test_app_nao_alcanca_a_linha_do_outro_nem_pedindo_pelo_id(
    conn: Conexao, dois_usuarios: None
) -> None:
    """Filtrar explicitamente pelo id alheio também não traz nada."""
    with conn.cursor() as cur:
        como_app(cur, ID_A)
        cur.execute("SELECT count(*) FROM app_users WHERE id = %s", (ID_B,))
        assert cur.fetchone() == (0,)


def test_app_nao_escreve_em_app_users(conn: Conexao, dois_usuarios: None) -> None:
    """A allowlist é administrada pelo `owner`; o app só lê."""
    with conn.cursor() as cur:
        como_app(cur, ID_A)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "INSERT INTO app_users (email, display_name) VALUES (%s, %s)",
                ("intruso@exemplo.com", "Intruso"),
            )


def test_current_app_user_nao_vaza_para_a_transacao_seguinte(conn: Conexao) -> None:
    """A propriedade que torna o pool compartilhado seguro (ADR-004)."""
    with conn.cursor() as cur:
        define_usuario(cur, ID_A)
        cur.execute("SELECT current_app_user()")
        assert cur.fetchone() == (ID_A,)

    conn.rollback()  # encerra a transação, como o fim de uma unit of work

    with conn.cursor() as cur:
        cur.execute("SELECT current_app_user()")
        assert cur.fetchone() == (None,)


def test_resolve_app_user_ignora_caixa_do_email(conn: Conexao, dois_usuarios: None) -> None:
    with conn.cursor() as cur:
        como_app(cur, None)
        cur.execute("SELECT resolve_app_user(%s)", ("A@Exemplo.COM",))
        assert cur.fetchone() == (ID_A,)


def test_resolve_app_user_devolve_nulo_fora_da_allowlist(
    conn: Conexao, dois_usuarios: None
) -> None:
    """Quem não está na allowlist vira modo demo (ADR-003), não erro."""
    with conn.cursor() as cur:
        como_app(cur, None)
        cur.execute("SELECT resolve_app_user(%s)", ("desconhecido@exemplo.com",))
        assert cur.fetchone() == (None,)


def test_resolve_app_user_ignora_usuario_inativo(conn: Conexao, dois_usuarios: None) -> None:
    """Revogar acesso é `active = false`, sem deploy."""
    with conn.cursor() as cur:
        cur.execute("UPDATE app_users SET active = false WHERE id = %s", (ID_A,))
        como_app(cur, None)
        cur.execute("SELECT resolve_app_user(%s)", ("a@exemplo.com",))
        assert cur.fetchone() == (None,)


def test_so_existe_um_demo_ativo(conn: Conexao) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_users (email, display_name, is_demo) VALUES (%s, %s, true)",
            ("demo1@exemplo.com", "Demo 1"),
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            cur.execute(
                "INSERT INTO app_users (email, display_name, is_demo) VALUES (%s, %s, true)",
                ("demo2@exemplo.com", "Demo 2"),
            )


@pytest.mark.parametrize(
    ("email", "restricao"),
    [
        ("MAIUSCULO@exemplo.com", "app_users_email_minusculo"),
        ("sem-arroba", "app_users_email_formato"),
        ("sem@dominio", "app_users_email_formato"),
    ],
)
def test_email_invalido_e_rejeitado(conn: Conexao, email: str, restricao: str) -> None:
    with conn.cursor() as cur:
        with pytest.raises(psycopg.errors.CheckViolation) as erro:
            cur.execute(
                "INSERT INTO app_users (email, display_name) VALUES (%s, %s)",
                (email, "Alguém"),
            )
        assert restricao in str(erro.value)
