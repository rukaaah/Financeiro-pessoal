"""Ponto de entrada do app.

Fica na raiz porque é onde o Streamlit Community Cloud procura por padrão.
O conteúdo de verdade está em `app/`.

Monta o que é de toda página — estilo, tarja e navegação; não há lateral —
e entrega a vez à página escolhida (ADR-011).

A navegação é nossa, não a `position="top"` do Streamlit: abaixo de ~640px ele
move o topo para a lateral recolhida, que era o defeito da v1 (adendo do
ADR-011, 2026-10-29). O `st.navigation` continua dono das rotas, escondido.
"""

import streamlit as st
from app.composicao import sessao_atual
from app.estilo import aplicar_estilo
from app.layout import navegacao, tarja

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

# Os sete destinos (ADR-011). A rota é explícita em `url_path`, para que mudar
# um rótulo não mude a URL; o primeiro é o padrão e mora em "/".
#
# Enquanto a reestruturação anda, alguns destinos ainda abrem a página da v1:
# Resumo → visao_geral.py e Ajustes → configuracoes.py até as tarefas deles
# (.design/interface-v2/TASKS.md). Importar, A receber e Acesso não têm rota
# própria: viram diálogo de Lançamentos e abas de Cofrinhos e de Ajustes.
PAGINAS = (
    ("app/paginas/visao_geral.py", "Resumo", ":material/today:", ""),
    ("app/paginas/orcamento.py", "Orçamento", ":material/savings:", "orcamento"),
    ("app/paginas/lancamentos.py", "Lançamentos", ":material/receipt_long:", "lancamentos"),
    ("app/paginas/cartoes.py", "Cartões", ":material/credit_card:", "cartoes"),
    ("app/paginas/cofrinhos.py", "Cofrinhos", ":material/flag:", "cofrinhos"),
    ("app/paginas/investimentos.py", "Investimentos", ":material/trending_up:", "investimentos"),
    ("app/paginas/configuracoes.py", "Ajustes", ":material/tune:", "ajustes"),
)


def _paginas() -> list[st.Page]:
    paginas = []
    for posicao, (caminho, titulo, icone, rota) in enumerate(PAGINAS):
        if posicao == 0:
            paginas.append(st.Page(caminho, title=titulo, icon=icone, default=True))
        else:
            paginas.append(st.Page(caminho, title=titulo, icon=icone, url_path=rota))
    return paginas


def _entrar() -> None:
    st.login(PROVEDOR_OIDC)


def main() -> None:
    aplicar_estilo()
    sessao = sessao_atual()
    paginas = _paginas()
    escolhida = st.navigation(paginas, position="hidden")
    # Título da aba por página: é o que o leitor de tela anuncia ao navegar, já
    # que o link ativo da barra própria não carrega `aria-current`.
    st.set_page_config(page_title=f"{escolhida.title} · Financeiro pessoal")

    tarja(sessao, _entrar)  # primeira coisa do conteúdo, antes da navegação e de qualquer número
    navegacao(paginas, escolhida)
    escolhida.run()


# O Streamlit executa este arquivo como script, então o guard não impede nada —
# e deixa o módulo importável, para que um teste possa ler PROVEDOR_OIDC sem
# disparar o app inteiro.
if __name__ == "__main__":
    main()
