"""Ponto de entrada do app.

Fica na raiz porque é onde o Streamlit Community Cloud procura por padrão.
O conteúdo de verdade está em `app/`.
"""

import streamlit as st
from app.composicao import esquecer_sessao, sessao_atual

from financeiro.identity.domain.usuario import ModoDeAcesso

st.set_page_config(
    page_title="Financeiro pessoal",
    page_icon=":material/account_balance_wallet:",
    layout="wide",
)

# Nome do provedor OIDC. Precisa ser exatamente o sufixo da seção
# `[auth.<provedor>]` nos secrets: com provedor nomeado, `st.login()` sem
# argumento não encontra as credenciais. Local, com `[auth]` sem nome, chamar
# sem argumento funciona — então o erro só apareceria em produção. Há teste
# conferindo que este nome e o docs/deploy.md não se separem.
PROVEDOR_OIDC = "google"

PAGINAS = (
    ("app/paginas/visao_geral.py", "Visão geral", ":material/dashboard:"),
    ("app/paginas/lancamentos.py", "Lançamentos", ":material/receipt_long:"),
    ("app/paginas/orcamento.py", "Orçamento", ":material/savings:"),
    ("app/paginas/cartoes.py", "Cartões", ":material/credit_card:"),
    ("app/paginas/cofrinhos.py", "Cofrinhos", ":material/flag:"),
    ("app/paginas/a_receber.py", "A receber", ":material/group:"),
    ("app/paginas/investimentos.py", "Investimentos", ":material/trending_up:"),
)


def _controles_de_conta() -> None:
    """Entrar e sair, na barra lateral.

    Visitante sem login não é tratado como erro: é o caminho normal num app
    público, e termina no modo demonstração (ADR-003).
    """
    sessao = sessao_atual()
    with st.sidebar:
        st.divider()
        if sessao.modo is ModoDeAcesso.DEMO:
            if st.button("Entrar com Google", width="stretch"):
                st.login(PROVEDOR_OIDC)
        elif st.button("Sair", width="stretch"):
            esquecer_sessao()
            st.logout()


def main() -> None:
    paginas = [
        st.Page(caminho, title=titulo, icon=icone, default=(indice == 0))
        for indice, (caminho, titulo, icone) in enumerate(PAGINAS)
    ]
    _controles_de_conta()
    st.navigation(paginas).run()


# O Streamlit executa este arquivo como script, então o guard não impede nada —
# e deixa o módulo importável, para que um teste possa ler PROVEDOR_OIDC sem
# disparar o app inteiro.
if __name__ == "__main__":
    main()
