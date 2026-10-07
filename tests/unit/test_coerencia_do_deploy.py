"""O código e o runbook de deploy concordam sobre o provedor de login?

Este teste existe por causa de um erro real: o app chamava `st.login()` sem
argumento enquanto o `docs/deploy.md` mandava configurar os secrets no formato
`[auth.google]`. Com provedor nomeado, `st.login()` sem argumento não acha as
credenciais — e, como um `secrets.toml` local no formato `[auth]` sem nome
funciona, o erro só apareceria depois do deploy.

Nenhum teste de código pegaria isso: a discordância era entre o código e um
arquivo de documentação.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DEPLOY = RAIZ / "docs" / "deploy.md"


def test_o_provedor_do_codigo_tem_secao_no_runbook() -> None:
    from streamlit_app import PROVEDOR_OIDC

    texto = DEPLOY.read_text(encoding="utf-8")
    secao = f"[auth.{PROVEDOR_OIDC}]"
    assert secao in texto, (
        f"o app chama st.login({PROVEDOR_OIDC!r}), mas o runbook não manda "
        f"criar a seção {secao} nos secrets"
    )


def test_o_runbook_nao_mistura_os_dois_formatos_de_auth() -> None:
    """`[auth]` sozinho é o formato de provedor único, e pede `st.login()` sem nome.

    Os dois formatos juntos, com as credenciais soltas em `[auth]` **e** numa
    subseção, deixariam ambíguo qual chamada é a correta.
    """
    from streamlit_app import PROVEDOR_OIDC

    texto = DEPLOY.read_text(encoding="utf-8")
    bloco_auth = re.search(r"^\[auth\]$(.*?)^\[", texto, re.MULTILINE | re.DOTALL)
    assert bloco_auth is not None, "o runbook precisa da seção [auth]"

    soltas = [
        chave
        for chave in ("client_id", "client_secret", "server_metadata_url")
        if re.search(rf"^{chave}\s*=", bloco_auth.group(1), re.MULTILINE)
    ]
    assert soltas == [], (
        f"credenciais em [auth] e em [auth.{PROVEDOR_OIDC}] ao mesmo tempo: "
        f"{soltas}. Escolha um formato — eles pedem chamadas diferentes de st.login()."
    )


def test_o_runbook_pede_os_dois_redirect_uris() -> None:
    """Faltando o de produção, o login funciona local e quebra publicado."""
    texto = DEPLOY.read_text(encoding="utf-8")
    assert "localhost:8501/oauth2callback" in texto
    assert "streamlit.app/oauth2callback" in texto


def test_st_login_recebe_o_nome_do_provedor() -> None:
    """A chamada sem argumento era o bug: funciona local e quebra publicado.

    Inspeciona o texto do arquivo de propósito. Um teste que só comparasse
    `PROVEDOR_OIDC` com o runbook não pegaria uma chamada `st.login()` ao lado
    de um constante correto e não usado — que é exatamente a forma que o erro
    tinha.
    """
    fonte = (RAIZ / "streamlit_app.py").read_text(encoding="utf-8")
    assert "st.login(PROVEDOR_OIDC)" in fonte

    # Ignora comentários: o próprio arquivo explica o erro citando a chamada
    # sem argumento, e isso não é uma chamada.
    codigo = [linha for linha in fonte.splitlines() if not linha.strip().startswith("#")]
    assert not any("st.login()" in linha for linha in codigo), (
        "st.login() sem argumento não encontra credenciais em [auth.<provedor>]"
    )
