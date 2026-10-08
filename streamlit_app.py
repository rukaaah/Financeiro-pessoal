"""Ponto de entrada do app.

Fica na raiz porque é onde o Streamlit Community Cloud procura por padrão.
O conteúdo de verdade está em `app/`.
"""

import streamlit as st
from app.composicao import (
    escolher_demonstracao,
    esquecer_sessao,
    ja_identificado,
    sessao_atual,
    visitante_escolheu_demo,
)
from app.dados import eh_admin_de_exemplo
from app.entrada import tela_de_entrada

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
    ("app/paginas/importar.py", "Importar", ":material/upload_file:"),
    ("app/paginas/configuracoes.py", "Configurações", ":material/settings:"),
)

# A página de acesso só existe para quem administra (RF19). Não está em PAGINAS
# porque aparece condicionalmente.
PAGINA_DE_ACESSO = ("app/paginas/acesso.py", "Acesso", ":material/admin_panel_settings:")

# Como a barra lateral agrupa as páginas.
SECOES = (
    ("Dia a dia", ("Visão geral", "Lançamentos", "Orçamento")),
    ("Dinheiro", ("Cartões", "Cofrinhos", "A receber", "Investimentos")),
    ("Sistema", ("Importar", "Configurações")),
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


def _tela_de_entrada() -> None:
    escolha = tela_de_entrada()
    if escolha == "google":
        st.login(PROVEDOR_OIDC)
    elif escolha == "demo":
        escolher_demonstracao()
        st.rerun()


def _navegacao(*, com_acesso: bool) -> dict[str, list[st.Page]]:
    por_titulo = {
        titulo: st.Page(caminho, title=titulo, icon=icone, default=(caminho == PAGINAS[0][0]))
        for caminho, titulo, icone in PAGINAS
    }
    secoes = {nome: [por_titulo[t] for t in titulos] for nome, titulos in SECOES}
    if com_acesso:
        caminho, titulo, icone = PAGINA_DE_ACESSO
        secoes["Sistema"].append(st.Page(caminho, title=titulo, icon=icone))
    return secoes


def main() -> None:
    if not ja_identificado() and not visitante_escolheu_demo():
        _tela_de_entrada()
        return

    sessao = sessao_atual()
    # TODO(claude-code): `eh_admin_de_exemplo` vira `app_users.is_admin` (RF19).
    com_acesso = eh_admin_de_exemplo(sessao.modo is ModoDeAcesso.DONO)
    _controles_de_conta()
    st.navigation(_navegacao(com_acesso=com_acesso)).run()


# O Streamlit executa este arquivo como script, então o guard não impede nada —
# e deixa o módulo importável, para que um teste possa ler PROVEDOR_OIDC sem
# disparar o app inteiro.
if __name__ == "__main__":
    main()
