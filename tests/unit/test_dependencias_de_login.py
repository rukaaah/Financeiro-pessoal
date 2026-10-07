"""A Authlib, de que o `st.login` depende, está instalada?

Existe por causa de um erro que só apareceu em produção: clicar em "Entrar com
Google" levantava `StreamlitMissingAuthlibError`. O `pyproject.toml` pedia
`streamlit`, sem o extra `[auth]` que traz a Authlib.

Nenhum teste chama `st.login` de verdade — ele redireciona o navegador para o
Google — então nada na suíte tocava esse caminho. Estes testes cobrem a lacuna
pelo lado da dependência, que é o que de fato faltava.
"""

import importlib.util

import pytest

# Os módulos que o próprio Streamlit importa em streamlit/auth_util.py e em
# streamlit/web/server/starlette/starlette_auth_routes.py. Checar o pacote raiz
# não bastaria: uma instalação parcial passaria.
MODULOS_EXIGIDOS = (
    "authlib",
    "authlib.jose",
    "authlib.integrations.starlette_client",
)


@pytest.mark.parametrize("modulo", MODULOS_EXIGIDOS)
def test_modulo_da_authlib_esta_instalado(modulo: str) -> None:
    assert importlib.util.find_spec(modulo) is not None, (
        f"{modulo} ausente: o st.login vai falhar com StreamlitMissingAuthlibError. "
        "O pyproject.toml precisa de `streamlit[auth]`, não só `streamlit`."
    )


def test_a_propria_verificacao_do_streamlit_passa() -> None:
    """Chama a função que o Streamlit usa antes de iniciar o fluxo OIDC.

    Testar o que o framework testa é mais confiável que repetir a nossa
    suposição sobre quais módulos ele precisa: se a exigência mudar numa versão
    futura, este teste acompanha.
    """
    from streamlit.auth_util import validate_auth_credentials

    try:
        from streamlit.errors import StreamlitMissingAuthlibError
    except ImportError:  # pragma: no cover - versão sem essa exceção
        pytest.skip("esta versão do Streamlit não expõe StreamlitMissingAuthlibError")

    # O que importa é o *tipo* do erro, não se houve erro. Com secrets
    # configurados a função passa; sem eles, reclama da configuração. Nos dois
    # casos, Authlib ausente seria um erro diferente — e é só esse que queremos
    # descartar.
    try:
        validate_auth_credentials("google")
    except StreamlitMissingAuthlibError as erro:  # pragma: no cover
        pytest.fail(f"Authlib ausente: instale com o extra `streamlit[auth]` ({erro})")
    except Exception:
        pass  # erro de configuração: não é o que este teste investiga


def test_o_pyproject_pede_o_extra_auth() -> None:
    """Guarda contra alguém "limpar" o extra sem saber para que serve."""
    import tomllib
    from pathlib import Path

    pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
    with pyproject.open("rb") as arquivo:
        config = tomllib.load(arquivo)

    dependencias = config["project"]["dependencies"]
    streamlit = [d for d in dependencias if d.startswith("streamlit")]
    assert streamlit, "streamlit não está nas dependências"
    assert all("[auth]" in d for d in streamlit), (
        f"streamlit precisa do extra [auth] para o st.login: {streamlit}"
    )
