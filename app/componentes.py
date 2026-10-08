"""Componentes de tela reaproveitados pelas páginas.

Visual sóbrio: cor só para o estado do orçamento (tokens em `app/estilo`). Todo
estado leva ícone e rótulo, nunca só cor.
"""

from datetime import date
from decimal import Decimal
from html import escape

import streamlit as st

from app import dados
from app.formatacao import (
    brl,
    hoje,
    ler_valor,
    mes_extenso,
    mes_numerico,
    primeiro_dia_do_mes,
    somar_meses,
)
from app.modelos import (
    ROTULO_DO_ESTADO,
    Estado,
    FinalidadeDoResgate,
    LinhaDeOrcamento,
    PedidoDeLancamento,
    TipoDeConta,
    TipoDeLancamento,
    estado_do_gasto,
)

NENHUM = "Nenhum"
PARCELAS_MAXIMAS = 36


# --------------------------------------------------------------------- HTML puro


def selo(estado: Estado, texto: str | None = None) -> str:
    rotulo = escape(texto or ROTULO_DO_ESTADO[estado])
    return f'<span class="fin-selo fin-selo--{estado.value}">{rotulo}</span>'


def barra(realizado: Decimal, previsto: Decimal) -> str:
    """Barra de progresso do realizado contra o previsto, com rótulo para leitor de tela."""
    if previsto > 0:
        largura = min(realizado / previsto, Decimal(1)) * 100
    else:
        largura = Decimal(100) if realizado > 0 else Decimal(0)
    estado = estado_do_gasto(realizado, previsto)
    descricao = escape(f"{brl(realizado)} de {brl(previsto)}")
    return (
        f'<div class="fin-barra fin-barra--{estado.value}" role="img" aria-label="{descricao}">'
        f'<span style="width:{largura:.0f}%"></span></div>'
    )


def linha_de_orcamento(linha: LinhaDeOrcamento) -> str:
    gasto = linha.realizado - linha.financiado_por_cofrinho
    nota = ""
    if linha.financiado_por_cofrinho > 0:
        nota = (
            f'<span class="fin-legenda">{brl(linha.financiado_por_cofrinho)} '
            "pagos com dinheiro de cofrinho</span>"
        )
    return (
        '<div class="fin-linha">'
        '<div class="fin-linha__topo">'
        f'<span class="fin-linha__nome">{escape(linha.categoria)}</span>'
        f'<span class="fin-valor">{brl(gasto)} de {brl(linha.previsto)}</span>'
        "</div>"
        f"{barra(gasto, linha.previsto)}"
        f'<div class="fin-linha__rodape">{selo(linha.estado)}{nota}</div>'
        "</div>"
    )


# ----------------------------------------------------------------- componentes Streamlit


def metrica(
    rotulo: str,
    valor: Decimal,
    *,
    detalhe: str | None = None,
    estado: Estado | None = None,
    ajuda: str | None = None,
) -> None:
    """Número com rótulo, num cartão. O detalhe fica abaixo, em texto neutro."""
    with st.container(border=True):
        st.metric(rotulo, brl(valor), help=ajuda)
        if detalhe:
            st.caption(detalhe)
        if estado is not None:
            st.html(selo(estado))


def seletor_de_mes(chave: str) -> date:
    """Mês navegável. O valor fica em `st.session_state[chave]`, sempre dia 1."""
    if chave not in st.session_state:
        st.session_state[chave] = primeiro_dia_do_mes(hoje())

    def mover(passo: int) -> None:
        st.session_state[chave] = somar_meses(st.session_state[chave], passo)

    anterior, centro, proximo = st.columns([1, 3, 1], vertical_alignment="center")
    anterior.button(
        "",
        icon=":material/chevron_left:",
        key=f"{chave}_anterior",
        on_click=mover,
        args=(-1,),
        help="Mês anterior",
        width="stretch",
    )
    centro.markdown(f"**{mes_extenso(st.session_state[chave]).capitalize()}**")
    proximo.button(
        "",
        icon=":material/chevron_right:",
        key=f"{chave}_proximo",
        on_click=mover,
        args=(1,),
        help="Próximo mês",
        width="stretch",
    )
    mes: date = st.session_state[chave]
    return mes


def aviso_de_exemplo() -> None:
    """Avisa que a tela mostra dados de exemplo, mesmo para quem está logado.

    Sem isto, o dono veria números inventados sem saber (ver `app.dados`).
    """
    st.info(
        "**Pré-visualização.** Estes números são de exemplo e ainda não vêm do banco: "
        "os casos de uso da Fase 1 ainda não estão ligados.",
        icon=":material/science:",
    )


# ------------------------------------------------------------------ diálogo Lançar


def botao_lancar(chave: str) -> None:
    """Ação principal do app: abre o lançamento rápido em qualquer página."""
    if st.button(
        "Lançar",
        icon=":material/add:",
        type="primary",
        key=chave,
        width="stretch",
        help="Despesa, receita ou transferência",
    ):
        dialogo_lancar()


@st.dialog("Lançar")
def dialogo_lancar() -> None:
    """Lançamento rápido: valor, categoria e conta; data de hoje. Poucos toques.

    Sem `st.form` de propósito: a prévia do mês da fatura precisa reagir ao que
    se digita. Dentro de um diálogo, cada interação reexecuta só o diálogo.
    """
    rotulo = st.segmented_control(
        "Tipo",
        [t.value for t in TipoDeLancamento],
        default=TipoDeLancamento.DESPESA.value,
        key="lancar_tipo",
        label_visibility="collapsed",
    )
    tipo = TipoDeLancamento(rotulo or TipoDeLancamento.DESPESA.value)

    # `st.number_input` devolve float, e dinheiro nunca é float neste projeto.
    texto_do_valor = st.text_input(
        "Valor (R$)", key="lancar_valor", placeholder="0,00", help="Ex.: 12,50"
    )
    contas = dados.contas()
    por_nome = {c.nome: c for c in contas}
    data = st.date_input("Data", value=hoje(), format="DD/MM/YYYY", key="lancar_data")

    categoria: str | None = None
    conta_destino: str | None = None
    parcelas = 1
    outra_pessoa: str | None = None
    valor_da_outra_pessoa: Decimal | None = None
    finalidade: FinalidadeDoResgate | None = None
    devolucao = False
    extras: dict[str, str] = {}

    if tipo is TipoDeLancamento.TRANSFERENCIA:
        nomes = [c.nome for c in contas]
        origem = st.selectbox("De", nomes, key="lancar_origem")
        conta_destino = st.selectbox(
            "Para", [n for n in nomes if n != origem], key="lancar_destino"
        )
        conta = origem
        if por_nome[origem].tipo is TipoDeConta.COFRINHO:
            finalidade = st.selectbox(
                "Finalidade do resgate",
                list(FinalidadeDoResgate),
                key="lancar_finalidade",
                format_func=lambda f: f.value,
                help="Empréstimo fica 'a devolver' até você repor.",
            )
        if por_nome[conta_destino].tipo is TipoDeConta.COFRINHO:
            devolucao = st.checkbox(
                "É devolução de empréstimo",
                key="lancar_devolucao",
                help="Sem marcar, conta como dinheiro guardado no mês.",
            )
    else:
        elegiveis = [
            c.nome
            for c in contas
            if c.tipo in (TipoDeConta.CORRENTE, TipoDeConta.CARTAO, TipoDeConta.DINHEIRO)
        ]
        conta = st.selectbox("Conta", elegiveis, key="lancar_conta")
        opcoes = (
            dados.categorias_de_despesa()
            if tipo is TipoDeLancamento.DESPESA
            else dados.categorias_de_receita()
        )
        categoria = st.selectbox("Categoria", opcoes, key="lancar_categoria")

        if tipo is TipoDeLancamento.DESPESA:
            cofrinhos = [c.nome for c in contas if c.tipo is TipoDeConta.COFRINHO]
            escolhido = st.selectbox(
                "Pago com dinheiro de cofrinho",
                [NENHUM, *cofrinhos],
                key="lancar_cofrinho",
                help="A despesa mantém a categoria, mas não consome a renda do mês.",
            )
            if escolhido != NENHUM:
                extras["financiado_por"] = escolhido

        if tipo is TipoDeLancamento.DESPESA and por_nome[conta].tipo is TipoDeConta.CARTAO:
            parcelas = int(
                st.number_input(
                    "Parcelas",
                    min_value=1,
                    max_value=PARCELAS_MAXIMAS,
                    value=1,
                    step=1,
                    key="lancar_parcelas",
                )
            )
            termos = por_nome[conta]
            if termos.fechamento is not None and termos.vencimento is not None:
                primeira = dados.mes_da_fatura(termos.fechamento, termos.vencimento, data)
                texto = f"Entra na fatura que vence em **{mes_numerico(primeira)}**."
                if parcelas > 1:
                    ultima = somar_meses(primeira, parcelas - 1)
                    texto += f" Última parcela em {mes_numerico(ultima)}."
                st.info(texto, icon=":material/credit_card:")

        if tipo is TipoDeLancamento.DESPESA and st.checkbox(
            "Paguei por outra pessoa",
            key="lancar_outra_pessoa",
            help="Vira valor a receber, não gasto seu.",
        ):
            outra_pessoa = st.selectbox("Quem", dados.pessoas(), key="lancar_quem")
            parte = st.text_input(
                "Valor dela (R$)",
                key="lancar_parte",
                placeholder="Tudo",
                help="Em branco: o valor inteiro.",
            )
            valor_da_outra_pessoa = ler_valor(parte) if parte.strip() else None

    descricao = st.text_input("Descrição (opcional)", key="lancar_descricao")

    if st.button("Salvar", type="primary", key="lancar_salvar", width="stretch"):
        valor = ler_valor(texto_do_valor)
        if valor is None:
            st.error("Informe um valor maior que zero, como 12,50.")
            return
        pedido = PedidoDeLancamento(
            tipo=tipo,
            valor=valor,
            conta=conta,
            data=data,
            descricao=descricao.strip(),
            categoria=categoria,
            conta_destino=conta_destino,
            parcelas=parcelas,
            paga_por_outra_pessoa=outra_pessoa,
            valor_da_outra_pessoa=valor_da_outra_pessoa,
            finalidade_do_resgate=finalidade,
            e_devolucao=devolucao,
            extras=extras,
        )
        resultado = dados.registrar_lancamento(pedido)
        st.toast(
            resultado.mensagem,
            icon=":material/check:" if resultado.gravado else ":material/science:",
        )
        st.rerun()


def tabela(
    linhas: list[dict[str, object]], *, a_direita: tuple[str, ...] = (), altura: int | None = None
) -> None:
    """Tabela somente leitura. Colunas de dinheiro vão à direita, como em extrato."""
    configuracao = {
        coluna: st.column_config.TextColumn(coluna, alignment="right") for coluna in a_direita
    }
    # `height` não aceita None nas sobrecargas do Streamlit: ou se passa um
    # número, ou não se passa.
    if altura is None:
        st.dataframe(linhas, hide_index=True, width="stretch", column_config=configuracao)
    else:
        st.dataframe(
            linhas, hide_index=True, width="stretch", column_config=configuracao, height=altura
        )
