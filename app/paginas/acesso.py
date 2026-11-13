"""Página "Acesso": quem pode entrar no app real (RF19). Só para quem administra.

Casos de uso a ligar: `identity.application.admin_listar_usuarios`,
`admin_adicionar_usuario`, `admin_desativar_usuario`, `admin_registro`.

Esconder esta página não protege nada. A regra "só admin" vale no banco, por funções
SECURITY DEFINER; a tela só reflete o que o banco permite.
"""

import streamlit as st

from app import dados
from app.componentes import tabela
from app.composicao import sessao_atual
from app.formatacao import data_curta
from app.layout import titulo
from financeiro.identity.domain.usuario import ModoDeAcesso

sessao = sessao_atual()
titulo("Acesso")

if sessao.modo is ModoDeAcesso.DEMO or not dados.eh_admin_de_exemplo(True):
    st.error("Esta página é só para quem administra o app.", icon=":material/lock:")
    st.stop()

st.caption(
    "Quem entra com um e-mail desta lista vê os dados reais. "
    "Qualquer outra conta Google cai no modo demonstração."
)

usuarios = dados.usuarios_com_acesso()
tabela(
    [
        {
            "E-mail": u.email,
            "Nome": u.nome,
            "Perfil": "administrador" if u.admin else "usuário",
            "Situação": "ativo" if u.ativo else "desativado",
            "Desde": data_curta(u.criado_em),
        }
        for u in usuarios
    ]
)

colunas = st.columns(2)
with colunas[0].popover("Liberar um e-mail", width="stretch"):
    email = st.text_input("E-mail Google", key="acesso_email")
    nome = st.text_input("Nome", key="acesso_nome")
    # TODO(claude-code): identity.admin_adicionar_usuario(email, nome); valida e-mail e duplicidade.
    if st.button("Liberar", key="acesso_liberar", disabled=not (email and "@" in email)):
        st.toast("Exemplo: nada foi gravado, o caso de uso ainda não está ligado.")
with colunas[1].popover("Desativar", width="stretch"):
    alvo = st.selectbox(
        "Pessoa", [u.email for u in usuarios if u.ativo and not u.admin], key="acesso_alvo"
    )
    st.caption("Desativar não apaga os dados da pessoa. Ela volta a cair no modo demonstração.")
    # TODO(claude-code): identity.admin_desativar_usuario(alvo)
    if st.button("Desativar", key="acesso_desativar", disabled=alvo is None):
        st.toast("Exemplo: nada foi gravado, o caso de uso ainda não está ligado.")

with st.expander("Registro de acessos"):
    tabela(
        [
            {"Data": data_curta(r.quando), "Quem": r.quem, "Ação": r.acao, "Alvo": r.alvo}
            for r in dados.registro_de_acesso()
        ]
    )
