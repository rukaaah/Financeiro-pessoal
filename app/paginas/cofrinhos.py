"""Cofrinhos: quanto está guardado em cada meta, e quem te deve (aba A receber).

Revisão de 2026-10-29: um destaque e uma régua no lugar dos cartões de alturas
diferentes; cada cofrinho é uma linha com a barra da meta.

Casos de uso a ligar: `goals.cofrinhos_do_mes` (view v_goal_month), `goals.aportar`,
`goals.resgatar`, `goals.criar_cofrinho`. Regras: RF14 e RF18. Resgate exige finalidade;
aporte só abate dívida quando marcado como devolução.
"""

from decimal import Decimal

import streamlit as st

from app import dados
from app.blocos import (
    Barra,
    Grupo,
    ItemDaRegua,
    Linha,
    barras,
    colunas,
    destaque,
    lista,
    quadro,
    regua,
)
from app.dialogos import dialogo_perdoar, dialogo_recebimento
from app.formatacao import brl, data_curta, hoje, ler_valor, percentual
from app.layout import titulo_com_mes
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


def _linha_do_cofrinho(c: Cofrinho) -> Linha:
    partes = []
    if c.meta:
        partes.append(f"meta {brl(c.meta)}")
    if c.deveria_ter is not None:
        diferenca = c.saldo - c.deveria_ter
        if diferenca == 0:
            partes.append("em dia")
        else:
            partes.append(f"{'adiantado' if diferenca > 0 else 'atrasado'} {brl(abs(diferenca))}")
    if c.percentual_do_cdi is not None:
        partes.append(f"rende {percentual(c.percentual_do_cdi, 0)} do CDI")
    atrasado = c.deveria_ter is not None and c.saldo < c.deveria_ter
    return Linha(
        c.nome.removeprefix("Cofrinho "),
        brl(c.saldo),
        " · ".join(partes) or "sem meta",
        icone="emergency" if c.reserva_de_emergencia else "savings",
        cor=4 if c.reserva_de_emergencia else 2,
        selo=(f"devolver {brl(c.a_devolver)}", "warn") if c.a_devolver > 0 else None,
        tom_barra="perto" if atrasado else "dentro",
        progresso=float(min(c.saldo / c.meta, Decimal(1))) if c.meta else None,
        valor_detalhe=f"+{brl(c.entrou_no_mes)}" if c.entrou_no_mes else "",
        tom_detalhe="positivo",
    )


mes = titulo_com_mes("Cofrinhos")
cofrinhos = dados.cofrinhos(mes)
pessoas = dados.pessoas_a_receber()

aba_cofrinhos, aba_receber = st.tabs(
    ["Cofrinhos", f"A receber ({len([p for p in pessoas if p.saldo > 0])})"]
)

with aba_cofrinhos:
    total = sum((c.saldo for c in cofrinhos), Decimal(0))
    a_devolver = sum((c.a_devolver for c in cofrinhos), Decimal(0))
    numeros = regua(
        (
            ItemDaRegua(
                "Entrou no mês",
                brl(sum((c.entrou_no_mes for c in cofrinhos), Decimal(0))),
                "",
                "positivo",
            ),
            ItemDaRegua("Saiu", brl(sum((c.saiu_no_mes for c in cofrinhos), Decimal(0)))),
            ItemDaRegua(
                "Rendeu",
                brl(sum((c.rendimento_no_mes for c in cofrinhos), Decimal(0))),
                "",
                "positivo",
            ),
        )
    )
    # Quanto das metas já está guardado, e quanto deveria estar a esta altura.
    com_meta = [c for c in cofrinhos if c.meta]
    soma_metas = sum((c.meta or Decimal(0) for c in com_meta), Decimal(0))
    guardado_com_meta = sum((c.saldo for c in com_meta), Decimal(0))
    deveria = sum((c.deveria_ter or Decimal(0) for c in com_meta), Decimal(0))
    progresso_metas = (
        barras(
            (
                Barra(
                    "Das metas",
                    float(guardado_com_meta / soma_metas),
                    f"{guardado_com_meta / soma_metas:.0%}",
                    "dentro" if guardado_com_meta >= deveria else "perto",
                ),
                Barra(
                    "Deveria estar",
                    float(deveria / soma_metas),
                    f"{deveria / soma_metas:.0%}",
                    "neutro",
                ),
            )
        )
        if soma_metas
        else ""
    )
    principal = destaque(
        "Guardado nos cofrinhos",
        brl(total),
        f"{brl(a_devolver)} a devolver: empréstimos que você fez para si mesmo"
        if a_devolver
        else "Nada a devolver.",
        "perto" if a_devolver else "dentro",
        numeros,
        corpo=progresso_metas,
    )
    # Revisão de 2026-10-30: a lista ao lado do total, e não abaixo dele.
    st.html(
        colunas(
            principal,
            quadro(
                "Cofrinhos",
                lista([Grupo([_linha_do_cofrinho(c) for c in cofrinhos])]),
                f"{len(cofrinhos)} no total",
            ),
            proporcao="iguais",
        )
    )

    # Ações numa linha só, para o cofrinho escolhido: a lista fica limpa.
    with st.container(horizontal=True, vertical_alignment="bottom", gap="small"):
        escolhido = st.selectbox(
            "Cofrinho",
            cofrinhos,
            format_func=lambda c: c.nome.removeprefix("Cofrinho "),
            key="cofrinho_escolhido",
        )
        if st.button("Aportar", icon=":material/add:", key="abrir_aporte"):
            dialogo_aportar(escolhido)
        if st.button("Resgatar", icon=":material/remove:", key="abrir_resgate"):
            dialogo_resgatar(escolhido)
        with st.popover("Novo", icon=":material/add_circle:"):
            # TODO(claude-code): goals.application.criar_cofrinho. Só o nome é obrigatório;
            # meta, data-alvo, aporte mensal e % do CDI são opcionais e editáveis depois.
            novo = st.text_input("Nome", key="novo_cofrinho_nome")
            st.text_input("Meta (R$, opcional)", key="novo_cofrinho_meta")
            st.text_input(
                "Inserção mensal prevista (R$, opcional)",
                key="novo_cofrinho_insercao",
                help="O que sai do salário todo mês para este cofrinho. Até esse valor, "
                "a inserção não aparece no Resumo; acima dele, aparece.",
            )
            st.date_input(
                "Data-alvo (opcional)", value=None, min_value=hoje(), key="novo_cofrinho_data"
            )
            if st.button("Criar", key="novo_cofrinho_criar", disabled=not novo.strip()):
                st.toast("Exemplo: nada foi gravado. Falta ligar goals.criar_cofrinho.")

with aba_receber:
    total_receber = sum((p.saldo for p in pessoas), Decimal(0))
    st.html(
        destaque(
            "A receber",
            brl(total_receber),
            "Entra no patrimônio, não no gasto do mês.",
        )
    )
    grupos = []
    for pessoa in sorted(pessoas, key=lambda p: p.saldo, reverse=True):
        grupos.append(
            Grupo(
                [
                    Linha(
                        item.descricao,
                        brl(item.valor),
                        f"{data_curta(item.data)} · há {item.dias_em_aberto} dias"
                        + (
                            " · saiu de " + ", ".join(nome for nome, _ in item.emprestado_de)
                            if item.emprestado_de
                            else ""
                        ),
                        icone="person",
                        cor=4,
                        tom="perto" if item.dias_em_aberto > 15 else "neutro",
                    )
                    for item in pessoa.itens
                ],
                pessoa.nome,
                brl(pessoa.saldo),
            )
        )
    st.html(lista(grupos))
    with st.container(horizontal=True, vertical_alignment="bottom", gap="small"):
        quem = st.selectbox("Pessoa", pessoas, format_func=lambda p: p.nome, key="receber_quem")
        if st.button("Registrar recebimento", icon=":material/payments:", key="abrir_receb"):
            dialogo_recebimento(quem)
        if st.button("Perdoar", icon=":material/volunteer_activism:", key="abrir_perdao"):
            dialogo_perdoar(quem)
