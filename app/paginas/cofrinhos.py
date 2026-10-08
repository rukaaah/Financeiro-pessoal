"""Página "Cofrinhos": um cartão por meta, com saldo, "deveria ter" e o que está a devolver.

Casos de uso a ligar: `goals.cofrinhos_do_mes` (view v_goal_month), `goals.aportar`,
`goals.resgatar`, `goals.criar_cofrinho`. Regras: RF14 e RF18. Resgate exige finalidade;
aporte só abate dívida quando marcado como devolução.
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.componentes import metrica, seletor_de_mes
from app.composicao import sessao_atual
from app.formatacao import brl, hoje, ler_valor, percentual
from app.layout import cabecalho, titulo
from app.modelos import Cofrinho, FinalidadeDoResgate


@st.dialog("Aportar")
def dialogo_aportar(cofrinho: Cofrinho) -> None:
    texto = st.text_input("Valor (R$)", key=f"aporte_valor_{cofrinho.nome}", placeholder="0,00")
    devolucao = False
    if cofrinho.a_devolver > 0:
        devolucao = st.checkbox(
            f"Marcar como devolução (a devolver: {brl(cofrinho.a_devolver)})",
            key=f"aporte_devolucao_{cofrinho.nome}",
            help="Sem marcar, o valor conta como guardado novo e a dívida continua.",
        )
    if st.button("Aportar", type="primary", key=f"aporte_ok_{cofrinho.nome}", width="stretch"):
        valor = ler_valor(texto)
        if valor is None:
            st.error("Informe um valor maior que zero, como 100,00.")
            return
        resultado = dados.registrar_movimento_de_cofrinho(
            cofrinho.nome, True, valor, "devolução" if devolucao else "aporte"
        )
        st.toast(resultado.mensagem)
        st.rerun()


@st.dialog("Resgatar")
def dialogo_resgatar(cofrinho: Cofrinho) -> None:
    texto = st.text_input("Valor (R$)", key=f"resgate_valor_{cofrinho.nome}", placeholder="0,00")
    opcoes = list(FinalidadeDoResgate)
    # Em reserva de emergência o padrão sugerido é "Empréstimo" (RF18).
    padrao = opcoes.index(
        FinalidadeDoResgate.EMPRESTIMO
        if cofrinho.reserva_de_emergencia
        else FinalidadeDoResgate.USADO
    )
    finalidade = st.selectbox(
        "Finalidade",
        opcoes,
        index=padrao,
        format_func=lambda f: f.value,
        key=f"resgate_finalidade_{cofrinho.nome}",
    )
    if (
        cofrinho.reserva_de_emergencia
        and finalidade is FinalidadeDoResgate.USADO
        and not st.checkbox("Confirmo que foi uma emergência real", key="resgate_confirma")
    ):
        st.caption("Em reserva de emergência, 'Usado' exige confirmação.")
        return
    if st.button("Resgatar", type="primary", key=f"resgate_ok_{cofrinho.nome}", width="stretch"):
        valor = ler_valor(texto)
        if valor is None:
            st.error("Informe um valor maior que zero, como 100,00.")
            return
        resultado = dados.registrar_movimento_de_cofrinho(
            cofrinho.nome, False, valor, finalidade.value
        )
        st.toast(resultado.mensagem)
        st.rerun()


cabecalho(sessao_atual())
titulo("Cofrinhos")

mes = seletor_de_mes("mes_cofrinhos")
cofrinhos = dados.cofrinhos(mes)

total_guardado = sum((c.saldo for c in cofrinhos), Decimal(0))
total_a_devolver = sum((c.a_devolver for c in cofrinhos), Decimal(0))
resumo = st.columns(2)
with resumo[0]:
    metrica("Total nos cofrinhos", total_guardado)
with resumo[1]:
    metrica(
        "A devolver aos cofrinhos",
        total_a_devolver,
        detalhe="Empréstimos que você fez para si mesmo",
    )

with st.popover("Novo cofrinho", icon=":material/add:"):
    # TODO(claude-code): goals.application.criar_cofrinho. Só o nome é obrigatório;
    # meta, data-alvo, aporte mensal e % do CDI são opcionais e editáveis depois.
    novo = st.text_input("Nome", key="novo_cofrinho_nome")
    st.text_input("Meta (R$, opcional)", key="novo_cofrinho_meta")
    st.date_input("Data-alvo (opcional)", value=None, min_value=hoje(), key="novo_cofrinho_data")
    st.text_input("Aporte mensal planejado (R$, opcional)", key="novo_cofrinho_aporte")
    if st.button("Criar", key="novo_cofrinho_criar", disabled=not novo.strip()):
        st.toast("Exemplo: nada foi gravado. Falta ligar goals.criar_cofrinho.")

for cofrinho in cofrinhos:
    with st.container(border=True):
        st.subheader(cofrinho.nome)
        if cofrinho.percentual_do_cdi is not None:
            st.caption(f"Rende {percentual(cofrinho.percentual_do_cdi, 0)} do CDI")

        st.metric("Saldo", brl(cofrinho.saldo))
        if cofrinho.meta:
            st.progress(float(min(cofrinho.saldo / cofrinho.meta, Decimal(1))))
            linha = f"Meta {brl(cofrinho.meta)}"
            if cofrinho.deveria_ter is not None:
                diferenca = cofrinho.saldo - cofrinho.deveria_ter
                situacao = "adiantado" if diferenca >= 0 else "atrasado"
                linha += (
                    f"  -  deveria ter {brl(cofrinho.deveria_ter)} "
                    f"({situacao} {brl(abs(diferenca))})"
                )
            st.caption(linha)

        dados_do_mes = st.columns(4)
        dados_do_mes[0].metric("Entrou", brl(cofrinho.entrou_no_mes))
        dados_do_mes[1].metric("Saiu", brl(cofrinho.saiu_no_mes))
        dados_do_mes[2].metric("Usado", brl(cofrinho.usado_no_mes))
        dados_do_mes[3].metric("Rendimento", brl(cofrinho.rendimento_no_mes))

        if cofrinho.a_devolver > 0:
            dias = f" há {cofrinho.dias_a_devolver} dias" if cofrinho.dias_a_devolver else ""
            st.warning(f"A devolver: {brl(cofrinho.a_devolver)}{dias}", icon=":material/undo:")

        if cofrinho.historico:
            st.line_chart(
                {
                    "Mês": [m for m, _, _ in cofrinho.historico],
                    "Saldo": [float(s) for _, s, _ in cofrinho.historico],
                    "Deveria ter": [float(d) for _, _, d in cofrinho.historico],
                },
                x="Mês",
                y=["Saldo", "Deveria ter"],
                height=160,
            )

        acoes = st.columns(2)
        if acoes[0].button("Aportar", key=f"abrir_aporte_{cofrinho.nome}", width="stretch"):
            dialogo_aportar(cofrinho)
        if acoes[1].button("Resgatar", key=f"abrir_resgate_{cofrinho.nome}", width="stretch"):
            dialogo_resgatar(cofrinho)
