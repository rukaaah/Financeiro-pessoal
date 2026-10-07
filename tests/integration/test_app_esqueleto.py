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
