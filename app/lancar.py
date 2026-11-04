"""Diálogo Lançar por intenção (ADR-011, decisão 5).

Quem lança diz o que aconteceu: **Gastei, Recebi, Guardei, Paguei a fatura**. O
tipo contábil (despesa, receita, transferência de duas pernas, perna que quita a
fatura) é do sistema: derivado da intenção e mostrado como confirmação antes de
salvar, nunca perguntado.

Sem `st.form` de propósito: a prévia da fatura e a confirmação reagem ao que se
digita. Dentro de um `st.dialog`, cada interação reexecuta só o diálogo, e o que
foi digitado fica nas chaves do `session_state` — erro não fecha nem apaga nada.
"""

from __future__ import annotations

from decimal import Decimal

import streamlit as st

from app import dados
from app.formatacao import brl, data_curta, hoje, ler_valor, mes_numerico, somar_meses
from app.modelos import (
    Conta,
    FinalidadeDoResgate,
    PedidoDeLancamento,
    SituacaoDaFatura,
    TipoDeConta,
    TipoDeLancamento,
)

GASTEI, RECEBI, GUARDEI, PAGUEI = "Gastei", "Recebi", "Guardei", "Paguei a fatura"
INTENCOES = {
    GASTEI: ":material/shopping_cart:",
    RECEBI: ":material/payments:",
    GUARDEI: ":material/savings:",
    PAGUEI: ":material/credit_card:",
}
PARCELAS_MAXIMAS = 36
NENHUM = "Nenhum"
PARA_O_COFRINHO, DO_COFRINHO = "Pôr no cofrinho", "Tirar do cofrinho"


def _confirmacao(texto: str) -> None:
    """O que o sistema vai registrar, em uma linha, antes do botão Salvar."""
    st.html(
        '<div class="fin-confirmacao"><span class="fin-simbolo" aria-hidden="true">'
        f"task_alt</span><span>{texto}</span></div>"
    )


def _valor(chave: str, rotulo: str = "Valor (R$)", padrao: str = "") -> Decimal | None:
    # `st.number_input` devolve float, e dinheiro nunca é float neste projeto.
    texto = st.text_input(rotulo, value=padrao, key=chave, placeholder="0,00")
    return ler_valor(texto) if texto.strip() else None


def _escolher_conta(rotulo: str, opcoes: list[Conta], chave: str) -> Conta:
    """Pílulas por NOME, não por objeto.

    Com `Conta` como opção, o diálogo quebrava ao reexecutar
    (StreamlitDefaultNotInOptionsError, visto no app em 2026-10-29).
    """
    por_nome = {c.nome: c for c in opcoes}
    nome = st.pills(rotulo, list(por_nome), default=opcoes[0].nome, key=chave)
    return por_nome.get(nome or opcoes[0].nome, opcoes[0])


def _salvar(pedido: PedidoDeLancamento | None, *, liberado: bool = True) -> None:
    if not st.button(
        "Salvar", type="primary", key="lancar_salvar", width="stretch", disabled=not liberado
    ):
        return
    if pedido is None:
        st.error("Informe um valor maior que zero, como 12,50.")
        return
    resultado = dados.registrar_lancamento(pedido)
    st.toast(
        resultado.mensagem,
        icon=":material/check:" if resultado.gravado else ":material/science:",
    )
    st.rerun()


# ------------------------------------------------------------------------------ Gastei


def _gastei(contas: tuple[Conta, ...]) -> None:
    valor = _valor("lancar_valor")
    categoria = st.selectbox("Categoria", dados.categorias_de_despesa(), key="lancar_categoria")
    configuracao = {c.nome: c for c in dados.categorias_configuradas()}
    vinculado = configuracao[categoria].cofrinho if categoria in configuracao else None

    # Categoria com cofrinho: três modalidades (decisão do Pedro, 2026-10-29).
    modalidade = None
    if vinculado is not None:
        opcoes = [f"Do cofrinho {vinculado}", "Do salário", "Pôr no cofrinho"]
        modalidade = (
            st.segmented_control(
                "De onde saiu o dinheiro",
                opcoes,
                default=opcoes[0],
                key=f"lancar_modalidade_{vinculado}",
            )
            or opcoes[0]
        )
        if modalidade == "Pôr no cofrinho":
            _por_no_cofrinho(contas, valor, vinculado)
            return
    do_cofrinho = vinculado is not None and modalidade == f"Do cofrinho {vinculado}"
    meios = (TipoDeConta.CORRENTE, TipoDeConta.CARTAO, TipoDeConta.DINHEIRO)
    pagaveis = [c for c in contas if c.tipo in meios]
    conta = _escolher_conta("Pago com", pagaveis, "lancar_conta")
    data = st.date_input("Data", value=hoje(), format="DD/MM/YYYY", key="lancar_data")

    parcelas = 1
    fatura_paga_ok = True
    frase_fatura = ""
    if conta.tipo is TipoDeConta.CARTAO and conta.fechamento and conta.vencimento:
        parcelas = int(
            st.number_input(
                "Parcelas", min_value=1, max_value=PARCELAS_MAXIMAS, value=1, key="lancar_parcelas"
            )
        )
        primeira = dados.mes_da_fatura(conta.fechamento, conta.vencimento, data)
        frase_fatura = f", entra na fatura que vence em {mes_numerico(primeira)}"
        if parcelas > 1:
            ultima = somar_meses(primeira, parcelas - 1)
            frase_fatura += f" (última parcela em {mes_numerico(ultima)})"
        # Lançamento retroativo em fatura já quitada: registra, mas ninguém sem saber.
        paga = next(
            (
                f
                for f in dados.faturas(conta.nome)
                if f.mes_de_vencimento == primeira and f.situacao is SituacaoDaFatura.PAGA
            ),
            None,
        )
        if paga is not None:
            novo_total = paga.total + (valor or Decimal(0)) / parcelas
            st.warning(
                f"Esta compra cai na fatura de {mes_numerico(primeira)}, que já foi paga"
                + (f" em {data_curta(paga.pago_em)}" if paga.pago_em else "")
                + f". O total dela passa a {brl(novo_total)}, e o orçamento daquele mês muda.",
                icon=":material/warning:",
            )
            fatura_paga_ok = st.checkbox("Entendi, lançar mesmo assim", key="lancar_fatura_paga")

    outra_pessoa: str | None = None
    parte: Decimal | None = None
    extras: dict[str, str] = {}
    with st.expander("Mais opções"):
        descricao = st.text_input("Descrição", key="lancar_descricao")
        if st.checkbox(
            "Paguei por outra pessoa", key="lancar_outra", help="Vira valor a receber, não gasto."
        ):
            outra_pessoa = st.selectbox("Quem", dados.pessoas(), key="lancar_quem")
            parte = _valor("lancar_parte", "Parte dela (R$, em branco = tudo)")
        cofrinhos = [c.nome for c in contas if c.tipo is TipoDeConta.COFRINHO]
        if vinculado is None:
            cofrinho = st.selectbox(
                "Usei dinheiro de um cofrinho",
                [NENHUM, *cofrinhos],
                key="lancar_cofrinho",
                help="Consome a categoria, não a renda do mês.",
            )
            if cofrinho != NENHUM:
                extras["financiado_por"] = cofrinho
    if do_cofrinho:
        extras["financiado_por"] = f"Cofrinho {vinculado}"

    if valor is not None:
        if outra_pessoa:
            dela = min(parte or valor, valor)
            texto = f"{brl(dela)} a receber de {outra_pessoa}"
            if valor - dela > 0:
                texto += f" e {brl(valor - dela)} de gasto seu em {categoria}"
        elif do_cofrinho:
            texto = f"Saída de {brl(valor)} do cofrinho {vinculado}, na categoria {categoria}"
        else:
            texto = f"Gasto de {brl(valor)} em {categoria}"
        texto += f", pago com {conta.nome}{frase_fatura}"
        if do_cofrinho:
            texto += "; não entra no gasto do mês"
        elif vinculado is not None:
            texto += (
                f"; é dinheiro do mês fora da inserção prevista no cofrinho {vinculado}, "
                "e aparece no Resumo"
            )
        elif extras:
            origem = extras["financiado_por"].removeprefix("Cofrinho ")
            texto += f"; sai do cofrinho {origem}, não da renda do mês"
        _confirmacao(texto + ".")

    pedido = (
        PedidoDeLancamento(
            tipo=TipoDeLancamento.DESPESA,
            valor=valor,
            conta=conta.nome,
            data=data,
            descricao=descricao.strip(),
            categoria=categoria,
            parcelas=parcelas,
            paga_por_outra_pessoa=outra_pessoa,
            valor_da_outra_pessoa=parte,
            extras=extras,
        )
        if valor is not None
        else None
    )
    _salvar(pedido, liberado=fatura_paga_ok)


def _por_no_cofrinho(contas: tuple[Conta, ...], valor: Decimal | None, cofrinho: str) -> None:
    """Modalidade "Pôr no cofrinho": transferência do salário para o cofrinho da categoria."""
    correntes = [c for c in contas if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.DINHEIRO)]
    origem = _escolher_conta("Saindo de", correntes, "lancar_conta_ins")
    data = st.date_input("Data", value=hoje(), format="DD/MM/YYYY", key="lancar_data")
    metas = dados.metas_de_guardado(hoje())
    previsto = next((m.planejado for m in metas if m.destino == f"Cofrinho {cofrinho}"), None)
    if valor is not None:
        texto = (
            f"Transferência de {brl(valor)}: {origem.nome} → cofrinho {cofrinho}; "
            "conta como guardado no mês"
        )
        if previsto is not None and valor > previsto:
            texto += (
                f". Passa da inserção prevista ({brl(previsto)}): "
                f"{brl(valor - previsto)} aparecem no Resumo"
            )
        _confirmacao(texto + ".")
    pedido = (
        PedidoDeLancamento(
            tipo=TipoDeLancamento.TRANSFERENCIA,
            valor=valor,
            conta=origem.nome,
            conta_destino=f"Cofrinho {cofrinho}",
            data=data,
        )
        if valor is not None
        else None
    )
    _salvar(pedido)


# ------------------------------------------------------------------------------ Recebi


def _recebi(contas: tuple[Conta, ...]) -> None:
    valor = _valor("lancar_valor")
    categoria = st.selectbox("Categoria", dados.categorias_de_receita(), key="lancar_cat_receita")
    correntes = [c for c in contas if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.DINHEIRO)]
    conta = _escolher_conta("Caiu em", correntes, "lancar_conta_r")
    data = st.date_input("Data", value=hoje(), format="DD/MM/YYYY", key="lancar_data")
    descricao = st.text_input("Descrição (opcional)", key="lancar_descricao")
    if valor is not None:
        _confirmacao(f"Entrada de {brl(valor)} em {categoria}, na conta {conta.nome}.")
    pedido = (
        PedidoDeLancamento(
            tipo=TipoDeLancamento.RECEITA,
            valor=valor,
            conta=conta.nome,
            data=data,
            descricao=descricao.strip(),
            categoria=categoria,
        )
        if valor is not None
        else None
    )
    _salvar(pedido)


# ----------------------------------------------------------------------------- Guardei


def _guardei(contas: tuple[Conta, ...]) -> None:
    sentido = (
        st.segmented_control(
            "Sentido", [PARA_O_COFRINHO, DO_COFRINHO], default=PARA_O_COFRINHO, key="lancar_sentido"
        )
        or PARA_O_COFRINHO
    )
    cofrinhos = [c for c in contas if c.tipo is TipoDeConta.COFRINHO]
    correntes = [c for c in contas if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.DINHEIRO)]
    valor = _valor("lancar_valor")
    cofrinho = st.selectbox(
        "Cofrinho",
        cofrinhos,
        format_func=lambda c: c.nome.removeprefix("Cofrinho "),
        key="lancar_qual_cofrinho",
    )
    corrente = _escolher_conta(
        "Conta" if sentido == PARA_O_COFRINHO else "Volta para", correntes, "lancar_conta_g"
    )
    data = st.date_input("Data", value=hoje(), format="DD/MM/YYYY", key="lancar_data")

    # A conta se chama "Cofrinho Jogos" e o cofrinho, "Jogos": compara sem o prefixo.
    nome_do_cofrinho = cofrinho.nome.removeprefix("Cofrinho ")
    a_devolver = next(
        (c.a_devolver for c in dados.cofrinhos(hoje()) if c.nome == nome_do_cofrinho),
        Decimal(0),
    )
    finalidade: FinalidadeDoResgate | None = None
    devolucao = False
    if sentido == PARA_O_COFRINHO:
        if a_devolver > 0:
            devolucao = st.checkbox(
                f"É devolução (você deve {brl(a_devolver)} a este cofrinho)",
                key="lancar_devolucao",
                help="Sem marcar, conta como guardado novo e a dívida continua.",
            )
        origem, destino = corrente.nome, cofrinho.nome
    else:
        finalidade = st.radio(
            "Para que é",
            list(FinalidadeDoResgate),
            format_func=lambda f: f.value,
            key="lancar_finalidade",
        )
        origem, destino = cofrinho.nome, corrente.nome

    if valor is not None:
        if sentido == PARA_O_COFRINHO:
            efeito = (
                "abate a dívida com o cofrinho, não conta como guardado novo"
                if devolucao
                else "conta como guardado no mês, não como gasto"
            )
        else:
            efeito = {
                FinalidadeDoResgate.USADO: "usado no objetivo do cofrinho",
                FinalidadeDoResgate.EMPRESTIMO: f"fica a devolver ao {cofrinho.nome}",
                FinalidadeDoResgate.RETIRADA: "retirada definitiva, sai do guardado",
            }[finalidade or FinalidadeDoResgate.USADO]
        _confirmacao(f"Transferência de {brl(valor)}: {origem} → {destino}; {efeito}.")

    pedido = (
        PedidoDeLancamento(
            tipo=TipoDeLancamento.TRANSFERENCIA,
            valor=valor,
            conta=origem,
            conta_destino=destino,
            data=data,
            finalidade_do_resgate=finalidade,
            e_devolucao=devolucao,
        )
        if valor is not None
        else None
    )
    _salvar(pedido)


# --------------------------------------------------------------------- Paguei a fatura


def _paguei(contas: tuple[Conta, ...]) -> None:
    cartoes = [c for c in contas if c.tipo is TipoDeConta.CARTAO]
    if not cartoes:
        st.caption("Nenhum cartão cadastrado. Cadastre em Ajustes → Cartões.")
        return
    cartao = _escolher_conta("Cartão", cartoes, "lancar_cartao")
    pagaveis = [f for f in dados.faturas(cartao.nome) if f.situacao is not SituacaoDaFatura.PAGA]
    if not pagaveis:
        st.caption("Nenhuma fatura em aberto neste cartão.")
        return
    fatura = st.selectbox(
        "Fatura que este pagamento quita",
        pagaveis,
        format_func=lambda f: f"Vence {mes_numerico(f.mes_de_vencimento)} · {brl(f.total)}",
        key="lancar_fatura",
    )
    correntes = [c for c in contas if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.DINHEIRO)]
    origem = _escolher_conta("Pagar com", correntes, "lancar_pg")
    valor = _valor(
        f"lancar_valor_fatura_{fatura.mes_de_vencimento}",
        padrao=f"{fatura.total:.2f}".replace(".", ","),
    )
    if valor is not None:
        falta = fatura.total - valor
        estado = "a fatura fica paga" if falta <= 0 else f"fica parcial, faltam {brl(falta)}"
        _confirmacao(
            f"Transferência de {brl(valor)}: {origem.nome} → {cartao.nome}, quitando a fatura "
            f"de {mes_numerico(fatura.mes_de_vencimento)}; {estado}. Não é gasto: as compras "
            "já contaram no mês da fatura."
        )
    if st.button("Pagar", type="primary", key="lancar_pagar", width="stretch"):
        if valor is None:
            st.error("Informe um valor maior que zero.")
            return
        resultado = dados.pagar_fatura(cartao.nome, fatura.mes_de_vencimento, origem.nome, valor)
        st.toast(
            resultado.mensagem,
            icon=":material/check:" if resultado.gravado else ":material/science:",
        )
        st.rerun()


# ------------------------------------------------------------------------------ diálogo


@st.dialog("Lançar")
def dialogo_lancar() -> None:
    intencao = st.segmented_control(
        "O que aconteceu?",
        list(INTENCOES),
        format_func=lambda nome: f"{INTENCOES[nome]} {nome}",
        key="lancar_intencao",
        width="stretch",
    )
    if intencao is None:
        st.caption("Escolha o que aconteceu. O app cuida da parte contábil.")
        return
    contas = dados.contas()
    {GASTEI: _gastei, RECEBI: _recebi, GUARDEI: _guardei, PAGUEI: _paguei}[intencao](contas)
