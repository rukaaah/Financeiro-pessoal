"""Aba Atenção do Resumo (RF20): itens com ação, adiar, resolver e contas recorrentes.

As regras ficam em `app.alertas` (funções puras, com teste). Aqui só o que é da
tela: o estado da sessão, os botões de cada item e os diálogos.

TODO(claude-code): "lembrar amanhã" e "resolvido" vivem na sessão até existir
`alert_snoozes`; o pagamento de conta recorrente idem até `recurring_bills`.
Recarregar a página esquece os dois — aceitável enquanto os dados são exemplo.
"""

from __future__ import annotations

import dataclasses
import hashlib
from collections.abc import Sequence
from datetime import date, timedelta
from decimal import Decimal
from html import escape

import streamlit as st

from app import dados
from app.blocos import Alerta, corpo_do_alerta
from app.formatacao import brl, data_curta, hoje, ler_valor
from app.modelos import ContaRecorrente, TipoDeConta, Urgencia

ADIADOS = "fin_adiados"
RESOLVIDOS = "fin_resolvidos"
PAGAS = "fin_contas_pagas"
VALORES_PAGOS = "fin_valores_pagos"


def _estado(chave: str) -> dict[str, date]:
    if chave not in st.session_state:
        st.session_state[chave] = {}
    valor: dict[str, date] = st.session_state[chave]
    return valor


def adiados() -> dict[str, date]:
    return _estado(ADIADOS)


def resolvidos() -> dict[str, date]:
    return _estado(RESOLVIDOS)


def contas_do_mes(mes: date) -> tuple[ContaRecorrente, ...]:
    """As contas recorrentes do mês com os pagamentos feitos nesta sessão."""
    pagas = _estado(PAGAS)
    return tuple(
        dataclasses.replace(c, paga_em=pagas[c.nome + c.vence_em.isoformat()])
        if c.pendente and (c.nome + c.vence_em.isoformat()) in pagas
        else c
        for c in dados.contas_recorrentes(mes)
    )


def pago_na_sessao() -> Decimal:
    """Quanto saiu da conta pelos pagamentos feitos nesta sessão (só no exemplo).

    Sem isso, pagar uma conta no exemplo a tirava da lista sem tirar o dinheiro
    da conta, e a folga crescia a cada pagamento.
    """
    valores: dict[str, Decimal] = st.session_state.get(VALORES_PAGOS, {})
    return sum(valores.values(), Decimal(0))


def _id(texto: str) -> str:
    """Chave de widget estável e curta a partir da chave do alerta."""
    return hashlib.sha1(texto.encode()).hexdigest()[:10]


# ------------------------------------------------------------------------- diálogos


@st.dialog("Pagar conta")
def dialogo_pagar_conta(conta: ContaRecorrente) -> None:
    st.html(
        '<p class="fin-legenda">'
        f"{escape(conta.nome)} · vence {data_curta(conta.vence_em)} · "
        f"{escape(conta.categoria)}</p>"
    )
    texto = st.text_input(
        "Valor (R$)",
        value=f"{conta.valor:.2f}".replace(".", ","),
        key="pagar_conta_valor",
        help="Estimativa: confira o valor do boleto." if conta.varia else None,
    )
    correntes = [c.nome for c in dados.contas() if c.tipo is TipoDeConta.CORRENTE]
    origem = st.selectbox(
        "Pagar com",
        correntes,
        index=correntes.index(conta.conta) if conta.conta in correntes else 0,
        key="pagar_conta_origem",
    )
    if st.button("Pagar", type="primary", key="pagar_conta_ok", width="stretch"):
        valor = ler_valor(texto)
        if valor is None:
            st.error("Informe um valor maior que zero, como 120,00.")
            return
        resultado = dados.pagar_conta_recorrente(
            conta.nome, conta.vence_em.replace(day=1), valor, origem
        )
        # Exemplo: a sessão lembra o pagamento para o item sair da lista.
        _estado(PAGAS)[conta.nome + conta.vence_em.isoformat()] = hoje()
        st.session_state.setdefault(VALORES_PAGOS, {})[conta.nome + conta.vence_em.isoformat()] = (
            valor
        )
        st.toast(resultado.mensagem, icon=":material/science:")
        st.rerun()


@st.dialog("Conta recorrente")
def dialogo_conta_recorrente() -> None:
    """Cadastro (Fluxo 10). Editar, pausar e encerrar ficam em Ajustes."""
    nome = st.text_input("Nome", placeholder="Conta de luz", key="recorrente_nome")
    coluna_valor, coluna_dia = st.columns(2)
    texto = coluna_valor.text_input("Valor (R$)", placeholder="120,00", key="recorrente_valor")
    dia = coluna_dia.number_input(
        "Vence todo dia", min_value=1, max_value=31, value=10, key="recorrente_dia"
    )
    varia = st.checkbox(
        "O valor muda todo mês",
        key="recorrente_varia",
        help="O valor acima vira estimativa; na hora de pagar você confirma o do boleto.",
    )
    categoria = st.selectbox("Categoria", dados.categorias_de_despesa(), key="recorrente_cat")
    contas = [c for c in dados.contas() if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.CARTAO)]
    conta = st.selectbox("Paga com", [c.nome for c in contas], key="recorrente_conta")
    if any(c.nome == conta and c.tipo is TipoDeConta.CARTAO for c in contas):
        st.info(
            "Paga no cartão, ela entra na fatura e não vira uma conta a pagar separada.",
            icon=":material/credit_card:",
        )
    urgencia = st.segmented_control(
        "Se faltar dinheiro, ela é",
        [u.value for u in Urgencia],
        default=Urgencia.IMPORTANTE.value,
        key="recorrente_urgencia",
        width="stretch",
    )
    avisar = st.number_input(
        "Avisar quantos dias antes", min_value=0, max_value=15, value=3, key="recorrente_aviso"
    )
    if st.button("Salvar", type="primary", key="recorrente_salvar", width="stretch"):
        valor = ler_valor(texto)
        if not nome.strip():
            st.error("Dê um nome para a conta, como Conta de luz.")
            return
        if valor is None:
            st.error("Informe um valor maior que zero, como 120,00.")
            return
        mes = hoje().replace(day=1)
        resultado = dados.salvar_conta_recorrente(
            ContaRecorrente(
                nome.strip(),
                valor,
                int(dia),
                categoria,
                conta,
                Urgencia(urgencia or Urgencia.IMPORTANTE.value),
                mes,
                varia,
                int(avisar),
            )
        )
        st.toast(resultado.mensagem, icon=":material/science:")
        st.rerun()


# -------------------------------------------------------------------------- itens


def itens_com_acoes(itens: Sequence[Alerta], contas: Sequence[ContaRecorrente]) -> None:
    """Cada pendência com a ação direta, "lembrar amanhã" e "resolvido" (RF20).

    O item é um container do Streamlit (para ter botões de verdade), com a cor da
    gravidade no CSS pela chave `fin-item-<gravidade>-...`.
    """
    por_nome = {c.nome: c for c in contas}
    with st.container(key="fin-pendencias", gap="small"):
        for alerta in itens:
            ident = _id(alerta.chave or alerta.titulo)
            # Uma linha no desktop (texto à esquerda, botões à direita); no celular os
            # botões descem para baixo do texto (flex-wrap no CSS).
            with st.container(
                key=f"fin-item-{alerta.gravidade}-{ident}",
                horizontal=True,
                vertical_alignment="center",
                gap="small",
            ):
                st.html(corpo_do_alerta(alerta))
                with st.container(
                    horizontal=True,
                    gap="small",
                    width="content",
                    vertical_alignment="center",
                    key=f"fin-item-acoes-{ident}",
                ):
                    if alerta.acao is not None:
                        acao = alerta.acao
                        if st.button(
                            acao.rotulo,
                            icon=f":material/{acao.icone}:",
                            key=f"acao-{ident}",
                            type="secondary",
                        ):
                            tipo, alvo = acao.destino.split(":", 1)
                            if tipo == "pagina":
                                st.switch_page(alvo)
                            elif tipo == "pagar" and alvo in por_nome:
                                dialogo_pagar_conta(por_nome[alvo])
                    if alerta.chave:
                        if st.button(
                            "Lembrar amanhã",
                            icon=":material/snooze:",
                            key=f"adiar-{ident}",
                            type="tertiary",
                            help="Some até amanhã.",
                        ):
                            adiados()[alerta.chave] = hoje()
                            st.toast(f"Volta amanhã: {alerta.titulo}.")
                            st.rerun()
                        rotulo = "Resolvido"
                        if st.button(
                            rotulo,
                            icon=":material/check:",
                            key=f"resolver-{ident}",
                            type="tertiary",
                            help=(
                                "Crítico some só até amanhã: se a causa continuar, ele volta."
                                if alerta.gravidade == "critico"
                                else "Some até o fim do mês."
                            ),
                        ):
                            resolvidos()[alerta.chave] = hoje()
                            st.rerun()


def proximo_vencimento(contas: Sequence[ContaRecorrente], depois_de: date) -> str:
    """Para o estado vazio: "Nada pendente" e o próximo vencimento (brief)."""
    futuras = [c for c in contas if c.pendente and c.vence_em > depois_de]
    if not futuras:
        proximas = dados.contas_recorrentes(depois_de.replace(day=1) + timedelta(days=32))
        futuras = [c for c in proximas if c.pendente]
    if not futuras:
        return "Nenhuma conta recorrente cadastrada."
    primeira = min(futuras, key=lambda c: c.vence_em)
    valor = ("~" if primeira.varia else "") + brl(primeira.valor)
    return f"Próximo vencimento: {primeira.nome}, {data_curta(primeira.vence_em)}, {valor}."
