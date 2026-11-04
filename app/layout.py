"""O que aparece em toda página: tarja de dados fictícios, navegação e título.

`streamlit_app.main()` chama `tarja` e `navegacao` uma vez por execução, antes
da página. As páginas chamam `titulo`; Ajustes chama `conta`. Não há barra
lateral (decisão de 2026-10-29): ela só teria Lançar, que já está em toda
página, e Sair.
"""

from collections.abc import Callable
from datetime import date
from html import escape

import streamlit as st

from app.componentes import botao_lancar, seletor_de_mes
from app.composicao import esquecer_sessao
from app.dados import DADOS_DE_EXEMPLO
from financeiro.identity.domain.usuario import ModoDeAcesso, Sessao

TEXTO_DEMONSTRACAO = (
    "<strong>Dados fictícios.</strong> Modo demonstração: nada aqui é real, e o que "
    "você mexer é apagado toda noite."
)
TEXTO_PRE_VISUALIZACAO = (
    "<strong>Pré-visualização.</strong> Números de exemplo: os casos de uso ainda "
    "não estão ligados ao banco."
)


# Dois ajustes que só o navegador sabe fazer, num script fixo (sem entrada do
# usuário, então o `unsafe_allow_javascript` não abre brecha):
# 1. Rolar a barra até o link ativo (no celular ele pode nascer fora da tela).
# 2. Marcar `data-theme` com o tema que o Streamlit está usando DE FATO. Os
#    tokens seguiam `prefers-color-scheme`, mas o Streamlit pode estar em outro
#    modo (menu dele, painel do app); deu texto claro sobre fundo claro nos
#    alertas. O observador pega a troca de tema, que não reexecuta o script.
ROLAR_ATE_O_ATIVO = """<script>
(() => {
  const app = document.querySelector('[data-testid="stApp"]');
  const marcar = () => {
    const [r, g, b] = getComputedStyle(app).backgroundColor.match(/\\d+/g).map(Number);
    const escuro = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
    document.documentElement.dataset.theme = escuro ? "dark" : "light";
  };
  if (app) {
    marcar();
    if (!window.__finTema) {
      window.__finTema = new MutationObserver(marcar);
      window.__finTema.observe(app, {attributes: true, attributeFilter: ["class", "style"]});
    }
  }
  requestAnimationFrame(() => document.querySelector(".st-key-fin-nav-ativo")
    ?.scrollIntoView({inline: "center", block: "nearest"}));
})();
</script>"""


def texto_da_tarja(sessao: Sessao) -> str | None:
    """Qual aviso a sessão precisa, ou nenhum.

    Dois fictícios diferentes: "demo" é fictício para sempre (ADR-003);
    "pré-visualização" é fictício porque o caso de uso ainda não está ligado
    (`DADOS_DE_EXEMPLO`), e some para o dono quando estiver.
    """
    if sessao.mostrar_faixa_de_dados_ficticios:
        return TEXTO_DEMONSTRACAO
    if DADOS_DE_EXEMPLO:
        return TEXTO_PRE_VISUALIZACAO
    return None


def tarja(sessao: Sessao, entrar: Callable[[], None]) -> None:
    """Uma linha permanente, a primeira coisa do conteúdo.

    É o aviso mais importante da tela: o app é público (ADR-002) e quem não está
    na allowlist vê números inventados. Vem antes da navegação e de qualquer
    número, em `role="note"` para o leitor de tela anunciá-la. Na demonstração
    carrega "Entrar com Google", que antes ficava na lateral.
    """
    texto = texto_da_tarja(sessao)
    if texto is None:
        return
    with st.container(horizontal=True, vertical_alignment="center", gap="small", key="fin-tarja"):
        st.html(f'<div class="fin-tarja" role="note">{texto}</div>')
        if sessao.modo is ModoDeAcesso.DEMO and st.button(
            "Entrar com Google", icon=":material/login:", key="entrar", width="content"
        ):
            entrar()


def navegacao(paginas: list[st.Page], atual: st.Page) -> None:
    """Os sete destinos numa linha, visível em toda largura (ADR-011).

    Abaixo da tarja, acima do título. No celular rola na horizontal em vez de
    quebrar ou sumir. `st.page_link` com o próprio `st.Page` usa a rota do
    `st.navigation`, então não há segundo cadastro de URL.

    O Streamlit marca a página ativa só com uma classe gerada, que muda a cada
    versão. Por isso a marca vem daqui: o link ativo fica num contêiner de chave
    `fin-nav-ativo`, que o CSS reconhece pela classe estável `st-key-…`.
    """
    with st.container(horizontal=True, gap="small", key="fin-nav"):
        for pagina in paginas:
            ativo = pagina.url_path == atual.url_path
            chave = "fin-nav-ativo" if ativo else f"fin-nav-{pagina.url_path or 'inicio'}"
            with st.container(key=chave, width="content"):
                st.page_link(pagina, width="content")
        # No celular a barra rola, e o ativo pode nascer fora da tela (Cartões em
        # 375px). Texto fixo, sem nada vindo do usuário: o "unsafe" não se aplica.
        st.html(ROLAR_ATE_O_ATIVO, unsafe_allow_javascript=True, width="content")


def conta(sessao: Sessao) -> None:
    """Quem está na sessão e "Sair", no topo de Ajustes (a lateral saiu).

    Na demonstração não aparece: quem não entrou não tem do que sair, e "Entrar
    com Google" já está na tarja de toda página.
    """
    if sessao.modo is ModoDeAcesso.DEMO:
        return
    with st.container(horizontal=True, vertical_alignment="center", key="fin-conta"):
        st.html(f'<span class="fin-legenda">{escape(sessao.usuario.display_name)}</span>')
        if st.button("Sair", icon=":material/logout:", key="sair", width="content"):
            esquecer_sessao()
            st.logout()


def titulo(texto: str) -> None:
    """Cabeçalho da página numa linha: título à esquerda, Lançar à direita.

    Revisão de 2026-10-30: o `st.title` com Lançar numa coluna própria gastava
    um terço da primeira dobra só com o nome da página.
    """
    with st.container(horizontal=True, vertical_alignment="center", gap="medium", key="fin-cabeca"):
        st.html(f'<h1 class="fin-titulo">{escape(texto)}</h1>', width="content")
        botao_lancar("lancar_topo")


def titulo_com_mes(texto: str) -> date:
    """Como `titulo`, com o seletor de mês na mesma linha (no celular, logo abaixo)."""
    with st.container(horizontal=True, vertical_alignment="center", gap="medium", key="fin-cabeca"):
        st.html(f'<h1 class="fin-titulo">{escape(texto)}</h1>', width="content")
        mes = seletor_de_mes()
        botao_lancar("lancar_topo")
    return mes
