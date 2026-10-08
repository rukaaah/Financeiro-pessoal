"""Página "Configurações": contas, cartões, categorias, regras e rendimento dos cofrinhos.

Casos de uso a ligar: `ledger.listar_contas/salvar_conta`, `cards.salvar_termos`,
`budgeting.listar_categorias/salvar_categoria`, `categorization.listar_regras/salvar_regra`.

Cartão (ADR-008): o usuário informa os dois números que o app do banco mostra, fechamento
(inclusivo) e vencimento. Mudar os números cria uma vigência nova; as faturas passadas não
mudam. A tela só avisa se o intervalo fugir de 7 a 10 dias; quem decide é o banco.
"""

import streamlit as st

from app import dados
from app.componentes import tabela
from app.composicao import sessao_atual
from app.formatacao import brl, data_curta, hoje
from app.layout import cabecalho, titulo
from app.modelos import TipoDeConta
from app.validacoes import dias_entre_fechamento_e_vencimento, intervalo_plausivel


@st.dialog("Novos prazos do cartão")
def dialogo_termos(cartao: str, fechamento: int, vencimento: int) -> None:
    novo_fechamento = st.number_input("Dia do fechamento", 1, 31, fechamento, key=f"fech_{cartao}")
    novo_vencimento = st.number_input("Dia do vencimento", 1, 31, vencimento, key=f"venc_{cartao}")
    vigencia = st.date_input("Vale a partir de", value=hoje(), key=f"desde_{cartao}")
    dias = dias_entre_fechamento_e_vencimento(int(novo_fechamento), int(novo_vencimento))
    if intervalo_plausivel(int(novo_fechamento), int(novo_vencimento)):
        st.caption(f"O vencimento cai {dias} dias depois do fechamento.")
    else:
        st.warning(
            f"O vencimento cai {dias} dias depois do fechamento; o normal é de 7 a 10. "
            "Confira no app do banco.",
            icon=":material/warning:",
        )
    st.caption("Fatura que já fechou não muda: a vigência nova vale daqui para frente.")
    if st.button("Salvar", type="primary", key=f"termos_ok_{cartao}", width="stretch"):
        # TODO(claude-code): cards.application.salvar_termos(cartao, fecha, vence, vigencia)
        st.toast(
            f"Exemplo: {cartao} não foi alterado (vigência {data_curta(vigencia)}); "
            "o caso de uso ainda não está ligado."
        )
        st.rerun()


cabecalho(sessao_atual())
titulo("Configurações")

aba_contas, aba_cartoes, aba_categorias, aba_regras = st.tabs(
    ["Contas", "Cartões", "Categorias", "Regras"]
)

with aba_contas:
    tabela(
        [{"Conta": c.nome, "Tipo": c.tipo.value, "Saldo": brl(c.saldo)} for c in dados.contas()],
        a_direita=("Saldo",),
    )
    st.caption(
        "Cofrinhos e contas a receber nascem nas páginas deles. CDBs: o % do CDI fica no cofrinho."
    )
    cdbs = [c for c in dados.contas() if c.tipo is TipoDeConta.COFRINHO]
    if cdbs:
        # TODO(claude-code): goals.salvar_percentual_do_cdi(conta, percentual)
        st.selectbox("Cofrinho que rende por CDI", [c.nome for c in cdbs], key="cfg_cdi_conta")
        st.text_input(
            "% do CDI",
            placeholder="100",
            key="cfg_cdi_valor",
            disabled=True,
            help="Ligar ao caso de uso de cofrinhos.",
        )

with aba_cartoes:
    for termos in dados.termos_dos_cartoes():
        with st.container(border=True):
            st.subheader(termos.cartao)
            colunas = st.columns(3)
            colunas[0].metric("Fechamento", f"dia {termos.fechamento}")
            colunas[1].metric("Vencimento", f"dia {termos.vencimento}")
            colunas[2].metric("Desde", data_curta(termos.vigente_desde))
            st.caption(
                "O gasto do dia do fechamento ainda entra nesta fatura. "
                "O orçamento conta pelo mês do vencimento."
            )
            if not intervalo_plausivel(termos.fechamento, termos.vencimento):
                st.warning(
                    "Intervalo fora do usual (7 a 10 dias). Confira no app do banco.",
                    icon=":material/warning:",
                )
            if st.button("Alterar prazos", key=f"alterar_{termos.cartao}"):
                dialogo_termos(termos.cartao, termos.fechamento, termos.vencimento)

with aba_categorias:
    st.caption(
        "Receitas e despesas. Arquivar esconde a categoria dos formulários, sem apagar o histórico."
    )
    tabela(
        [
            {
                "Grupo": c.grupo,
                "Categoria": c.nome,
                "Tipo": c.tipo,
                "Situação": "arquivada" if c.arquivada else "ativa",
            }
            for c in dados.categorias_configuradas()
        ]
    )
    with st.popover("Nova categoria"):
        st.text_input("Nome", key="cfg_categoria_nome")
        st.selectbox("Tipo", ["Despesa", "Receita"], key="cfg_categoria_tipo")
        # TODO(claude-code): budgeting.criar_categoria (entra no modelo de previsto).
        st.button("Criar", key="cfg_categoria_criar", disabled=True)

with aba_regras:
    st.caption(
        "Quando a descrição do extrato contém o texto, a categoria é sugerida. "
        "Menor prioridade vence."
    )
    tabela(
        [
            {"Prioridade": r.prioridade, "Contém": r.padrao, "Categoria": r.categoria}
            for r in sorted(dados.regras_de_categoria(), key=lambda r: r.prioridade)
        ]
    )
    with st.popover("Nova regra"):
        st.text_input("Contém", key="cfg_regra_padrao")
        st.selectbox("Categoria", dados.categorias_de_despesa(), key="cfg_regra_categoria")
        # TODO(claude-code): categorization.criar_regra
        st.button("Criar", key="cfg_regra_criar", disabled=True)
