"""Página "Configurações": contas, cartões, categorias, regras e rendimento dos cofrinhos.

Casos de uso a ligar: `ledger.listar_contas/salvar_conta`, `cards.salvar_termos`,
`budgeting.listar_categorias/salvar_categoria`, `categorization.listar_regras/salvar_regra`.

Cartão (ADR-008): o usuário informa os dois números que o app do banco mostra, fechamento
(inclusivo) e vencimento. Mudar os números cria uma vigência nova; as faturas passadas não
mudam. A tela só avisa se o intervalo fugir de 7 a 10 dias; quem decide é o banco.
"""

import streamlit as st

from app import carteira, dados
from app.blocos import Dobra, Grupo, Linha, dobras, icone_do_grupo, lista, secao
from app.composicao import sessao_atual
from app.formatacao import brl, data_curta, hoje
from app.layout import conta, titulo
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


titulo("Ajustes")
conta(sessao_atual())

ICONE_DO_TIPO = {
    TipoDeConta.CORRENTE: ("account_balance", 1),
    TipoDeConta.DINHEIRO: ("payments", 1),
    TipoDeConta.CARTAO: ("credit_card", 5),
    TipoDeConta.COFRINHO: ("savings", 2),
    TipoDeConta.INVESTIMENTO: ("trending_up", 3),
    TipoDeConta.A_RECEBER: ("person", 4),
}

aba_contas, aba_cartoes, aba_categorias, aba_invest, aba_regras = st.tabs(
    ["Contas", "Cartões", "Categorias", "Investimentos", "Regras"]
)

with aba_contas:
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            c.nome,
                            brl(c.saldo),
                            c.tipo.value,
                            icone=ICONE_DO_TIPO[c.tipo][0],
                            cor=ICONE_DO_TIPO[c.tipo][1],
                            tom="negativo" if c.saldo < 0 else "neutro",
                        )
                        for c in dados.contas()
                    ]
                )
            ]
        )
    )
    st.caption(
        "Cofrinhos e contas a receber nascem nas páginas deles. CDBs: o % do CDI fica no cofrinho."
    )

with aba_cartoes:
    termos_todos = dados.termos_dos_cartoes()
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            t.cartao,
                            f"dia {t.fechamento} → dia {t.vencimento}",
                            f"fecha → vence · desde {data_curta(t.vigente_desde)}",
                            icone="credit_card",
                            cor=1,
                            selo=None
                            if intervalo_plausivel(t.fechamento, t.vencimento)
                            else ("intervalo incomum", "warn"),
                        )
                        for t in termos_todos
                    ]
                )
            ]
        )
    )
    st.caption(
        "Como o app do banco mostra. O gasto do dia do fechamento ainda entra nesta fatura; "
        "o orçamento conta pelo mês do vencimento."
    )
    with st.container(horizontal=True, vertical_alignment="bottom", gap="small"):
        qual = st.selectbox(
            "Cartão", termos_todos, format_func=lambda t: t.cartao, key="cfg_cartao"
        )
        if st.button("Alterar prazos", icon=":material/edit_calendar:", key="alterar_prazos"):
            dialogo_termos(qual.cartao, qual.fechamento, qual.vencimento)

with aba_categorias:
    categorias = dados.categorias_configuradas()
    for tipo in ("Despesa", "Receita"):
        do_tipo = [c for c in categorias if c.tipo == tipo]
        grupos_do_tipo = list(dict.fromkeys(c.grupo for c in do_tipo))
        st.html(secao("Despesas" if tipo == "Despesa" else "Receitas"))
        st.html(
            dobras(
                [
                    Dobra(
                        g,
                        "",
                        f"{len([c for c in do_tipo if c.grupo == g])} categorias",
                        [
                            Linha(
                                c.nome,
                                "",
                                "arquivada" if c.arquivada else "",
                                selo={
                                    "fixa": ("fixo", "informativo"),
                                    "cofrinho": (f"cofrinho {c.cofrinho}", "informativo"),
                                }.get(c.natureza),
                            )
                            for c in do_tipo
                            if c.grupo == g
                        ],
                        icone=icone_do_grupo(g)[0],
                        cor=icone_do_grupo(g)[1],
                    )
                    for g in grupos_do_tipo
                ]
            )
        )
    st.caption(
        "Fixo: já tem destino todo mês. Com cofrinho: só aparece no Resumo o que sair do "
        "salário além da inserção prevista. "
        "Nenhum dos dois entra em 'Onde ainda cabe'. Arquivar esconde dos formulários, "
        "sem apagar o histórico."
    )
    with st.popover("Nova categoria", icon=":material/add:"):
        st.text_input("Nome", key="cfg_categoria_nome")
        tipo_nova = st.selectbox("Tipo", ["Despesa", "Receita"], key="cfg_categoria_tipo")
        if tipo_nova == "Despesa":
            natureza = st.radio(
                "Como é esse gasto",
                ["Variável", "Fixo (mensalidade, assinatura)", "Tem um cofrinho"],
                key="cfg_categoria_natureza",
                help="Fixos e categorias com cofrinho não aparecem em 'Onde ainda cabe'.",
            )
            if natureza == "Tem um cofrinho":
                st.selectbox(
                    "Cofrinho",
                    [c.nome for c in dados.cofrinhos(hoje())],
                    key="cfg_categoria_cofrinho",
                    help="Lançar pergunta: do cofrinho, do salário ou pôr no cofrinho. "
                    "A inserção mensal prevista é a do cofrinho.",
                )
        # TODO(claude-code): budgeting.criar_categoria (entra no modelo de previsto).
        st.button("Criar", key="cfg_categoria_criar", disabled=True)

with aba_invest:
    st.html(
        '<p class="fin-legenda">Regras que o "Onde aportar" usa. São suas: o app só aplica.</p>'
    )
    metas = carteira.metas()
    st.html(secao("Meta de alocação por classe"))
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(classe, f"{meta:.0f}%", icone="pie_chart", cor=i + 1)
                        for i, (classe, meta) in enumerate(metas.items())
                    ]
                )
            ]
        )
    )
    criterios = carteira.Criterios()
    st.html(secao("Critérios"))
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            "P/VP máximo",
                            f"{criterios.p_vp_maximo:.2f}".replace(".", ","),
                            "acima disso o fundo fica de fora",
                            icone="sell",
                            cor=1,
                        ),
                        Linha(
                            "Peso máximo por ativo",
                            f"{criterios.peso_maximo_por_ativo:.0f}%",
                            "do patrimônio depois do aporte",
                            icone="balance",
                            cor=2,
                        ),
                        Linha(
                            "Liquidez mínima",
                            f"R$ {criterios.liquidez_minima / 1000:.0f} mil/dia",
                            "negociado por dia no fundo",
                            icone="water_drop",
                            cor=3,
                        ),
                        Linha(
                            "Destino da sobra",
                            criterios.destino_da_sobra,
                            "o que não fecha cota inteira",
                            icone="savings",
                            cor=6,
                        ),
                    ]
                )
            ]
        )
    )
    # TODO(claude-code): editar metas e critérios (investments.application.salvar_regras).

with aba_regras:
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            f"Contém “{r.padrao}”",
                            r.categoria,
                            f"prioridade {r.prioridade}",
                            icone="rule",
                            cor=6,
                        )
                        for r in sorted(dados.regras_de_categoria(), key=lambda r: r.prioridade)
                    ]
                )
            ]
        )
    )
    st.caption(
        "Quando a descrição do extrato contém o texto, a categoria é sugerida. "
        "Menor prioridade vence."
    )
    with st.popover("Nova regra", icon=":material/add:"):
        st.text_input("Contém", key="cfg_regra_padrao")
        st.selectbox("Categoria", dados.categorias_de_despesa(), key="cfg_regra_categoria")
        # TODO(claude-code): categorization.criar_regra
        st.button("Criar", key="cfg_regra_criar", disabled=True)
