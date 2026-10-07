"""O app sobe, roteia e avisa que os dados são fictícios?

Usa o `AppTest` do Streamlit, que executa o script de verdade — então um erro
de montagem das dependências, de import ou de chamada de API aparece aqui, e
não só quando alguém abre o navegador.

É teste de integração porque o app conecta ao banco para resolver a identidade.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

pytestmark = pytest.mark.integration

RAIZ = Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "streamlit_app.py"
TEMPO_LIMITE = 30

PAGINAS_ESPERADAS = (
    "Visão geral",
    "Lançamentos",
    "Orçamento",
    "Cartões",
    "Cofrinhos",
    "A receber",
    "Investimentos",
)


@pytest.fixture(autouse=True)
def pool_limpo() -> Iterator[None]:
    """Descarta o pool guardado pelo `st.cache_resource` entre testes.

    O cache vive no processo, não na sessão: sem limpá-lo, o segundo teste
    reaproveita o pool do primeiro e `_url_do_banco()` nem é chamado — o que
    fez um teste de configuração ausente passar por engano.
    """
    st.cache_resource.clear()
    yield
    st.cache_resource.clear()


@pytest.fixture
def demo_no_banco(url_do_banco: str) -> Iterator[None]:
    """Um usuário demo commitado, que é onde o app cai sem login.

    Precisa estar commitado porque o app abre a própria conexão, pelo pool.
    """
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
            yield
        finally:
            with conexao.cursor() as cur:
                cur.execute("DELETE FROM app_users WHERE id = %s", (demo,))


@pytest.fixture
def app(url_do_banco: str, demo_no_banco: None, monkeypatch: pytest.MonkeyPatch) -> AppTest:
    # Pelo ambiente, que é a precedência que o app usa e o caminho do
    # desenvolvimento. Os secrets ficam vazios de propósito, para o teste nunca
    # alcançar o banco de produção de quem o estiver rodando.
    monkeypatch.setenv("DATABASE_URL", url_do_banco)
    teste = AppTest.from_file(str(ENTRADA), default_timeout=TEMPO_LIMITE)
    teste.secrets["database"] = {"url": ""}
    return teste


def test_o_app_sobe_sem_erro(app: AppTest) -> None:
    resultado = app.run()
    assert not resultado.exception, [str(e) for e in resultado.exception]


def test_a_navegacao_tem_as_sete_paginas(app: AppTest) -> None:
    """Se uma página tiver caminho errado, o st.navigation falha aqui."""
    from streamlit_app import PAGINAS

    assert tuple(titulo for _, titulo, _ in PAGINAS) == PAGINAS_ESPERADAS
    for caminho, _, _ in PAGINAS:
        assert (RAIZ / caminho).is_file(), f"página inexistente: {caminho}"


def test_visitante_sem_login_ve_a_faixa_de_dados_ficticios(app: AppTest) -> None:
    """O aviso mais importante da tela: o app é público e o visitante vê números inventados."""
    resultado = app.run()
    assert not resultado.exception, [str(e) for e in resultado.exception]

    avisos = [aviso.value for aviso in resultado.warning]
    assert any("Dados fictícios" in texto for texto in avisos), (
        f"faixa de dados fictícios ausente; avisos encontrados: {avisos}"
    )


def test_visitante_sem_login_recebe_o_botao_de_entrar(app: AppTest) -> None:
    resultado = app.run()
    rotulos = [botao.label for botao in resultado.sidebar.button]
    assert "Entrar com Google" in rotulos
    assert "Sair" not in rotulos


def test_a_pagina_inicial_e_a_visao_geral(app: AppTest) -> None:
    resultado = app.run()
    titulos = [titulo.value for titulo in resultado.title]
    assert titulos == ["Visão geral"]


def test_sem_configuracao_de_banco_a_falha_e_explicita(monkeypatch: pytest.MonkeyPatch) -> None:
    """E a mensagem não repete a URL, que é segredo num repositório público."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    teste = AppTest.from_file(str(ENTRADA), default_timeout=TEMPO_LIMITE)
    # Zera também os secrets: o Streamlit carrega .streamlit/secrets.toml
    # sozinho, e sem isto o teste conectaria no banco de produção da máquina de
    # quem estivesse rodando.
    teste.secrets["database"] = {"url": ""}
    resultado = teste.run()

    assert resultado.exception
    mensagens = " ".join(str(e.value) for e in resultado.exception)
    assert "não configurada" in mensagens
    assert "postgres" not in mensagens.lower()


# ---------------------------------------------- roteamento dono/demo
#
# A validação mais importante da T9: uma conta Google fora da allowlist precisa
# cair no modo demonstração. Falhar aqui significa expor dado financeiro real
# num app público, então o teste simula o login de verdade em vez de confiar na
# inspeção do caso de uso.


@pytest.fixture
def dono_no_banco(url_do_banco: str) -> Iterator[str]:
    """Um usuário real na allowlist, com e-mail conhecido."""
    email = f"dono-{uuid.uuid4()}@exemplo.com"
    with psycopg.connect(url_do_banco, autocommit=True) as conexao:
        with conexao.cursor() as cur:
            cur.execute(
                "INSERT INTO app_users (email, display_name) VALUES (%s, 'Dono')",
                (email,),
            )
        try:
            yield email
        finally:
            with conexao.cursor() as cur:
                cur.execute("DELETE FROM app_users WHERE email = %s", (email,))


def _finge_login(monkeypatch: pytest.MonkeyPatch, email: str, *, verificado: bool) -> None:
    """Coloca em `st.user` o que o `st.login` deixaria depois de um login Google."""
    monkeypatch.setattr(
        st,
        "user",
        {
            "is_logged_in": True,
            "email": email,
            "email_verified": verificado,
            "name": "Pessoa",
        },
        raising=False,
    )


def test_conta_fora_da_allowlist_cai_no_demo(app: AppTest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Logada no Google, com e-mail verificado, mas ausente de `app_users`."""
    _finge_login(monkeypatch, "estranha@gmail.com", verificado=True)
    resultado = app.run()

    assert not resultado.exception, [str(e) for e in resultado.exception]
    avisos = [aviso.value for aviso in resultado.warning]
    assert any("Dados fictícios" in texto for texto in avisos), (
        "conta fora da allowlist não caiu no demo — isto exporia dado real"
    )


def test_conta_da_allowlist_entra_como_dono(
    app: AppTest, dono_no_banco: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    _finge_login(monkeypatch, dono_no_banco, verificado=True)
    resultado = app.run()

    assert not resultado.exception, [str(e) for e in resultado.exception]
    avisos = [aviso.value for aviso in resultado.warning]
    assert not any("Dados fictícios" in texto for texto in avisos)
    assert "Sair" in [botao.label for botao in resultado.sidebar.button]


def test_email_da_allowlist_mas_nao_verificado_cai_no_demo(
    app: AppTest, dono_no_banco: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """O e-mail certo não basta: sem verificação do provedor, não se confia nele."""
    _finge_login(monkeypatch, dono_no_banco, verificado=False)
    resultado = app.run()

    assert not resultado.exception, [str(e) for e in resultado.exception]
    avisos = [aviso.value for aviso in resultado.warning]
    assert any("Dados fictícios" in texto for texto in avisos)


def test_usuario_inativo_cai_no_demo(
    app: AppTest, dono_no_banco: str, url_do_banco: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Revogar acesso é `active = false`, sem deploy (ADR-003)."""
    with psycopg.connect(url_do_banco, autocommit=True) as conexao, conexao.cursor() as cur:
        cur.execute("UPDATE app_users SET active = false WHERE email = %s", (dono_no_banco,))

    _finge_login(monkeypatch, dono_no_banco, verificado=True)
    resultado = app.run()

    assert not resultado.exception, [str(e) for e in resultado.exception]
    avisos = [aviso.value for aviso in resultado.warning]
    assert any("Dados fictícios" in texto for texto in avisos)
