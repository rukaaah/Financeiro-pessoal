"""Página "Orçamento": previsto x realizado por categoria, e quanto foi guardado.

Casos de uso a ligar: `budgeting.orcamento_do_mes`, `budgeting.modelo_de_previsto`
(novo: substitui "copiar mês anterior"), `goals.guardado_do_mes`.

Regras da tela (decisões do grill de 2026-10-08):
- gasto e guardado aparecem separados; aporte é transferência;
- previsto = modelo recorrente por categoria + ajuste só nos meses que fogem;
- renda acima da base aparece à parte, como "acima do previsto".
"""

from decimal import Decimal
from itertools import groupby

import streamlit as st

from app import dados
from app.blocos import (
    Alerta,
    Barra,
    Dobra,
    Grupo,
    ItemDaRegua,
    Linha,
    Tom,
    alertas,
    barras,
    colunas,
    destaque,
    dobras,
    icone_do_grupo,
    lista,
    quadro,
    regua,
)
from app.formatacao import brl
from app.layout import titulo_com_mes
from app.modelos import Estado, estado_do_gasto

# Estado do orçamento → (tom do valor/barra, selo). Selo sempre com texto (brief).
VISUAL_DO_ESTADO: dict[Estado, tuple[Tom, tuple[str, str]]] = {
    Estado.OK: ("dentro", ("dentro", "ok")),
    Estado.ATENCAO: ("perto", ("perto", "warn")),
    Estado.ESTOUROU: ("fora", ("fora", "over")),
}


def _razao(gasto: Decimal, previsto: Decimal) -> float:
    return float(gasto / previsto) if previsto else 1.0


mes = titulo_com_mes("Orçamento")
resumo = dados.resumo_do_mes(mes)

estado = estado_do_gasto(resumo.gasto, resumo.gasto_previsto)
restam = resumo.gasto_previsto - resumo.gasto
tom_do_mes = VISUAL_DO_ESTADO[estado][0]
linhas_do_mes = dados.orcamento_do_mes(mes)

# Painel do topo (revisão de 2026-10-30): o destaque leva os números que o
# explicam, e ao lado ficam as categorias mais perto do limite, que é o que se
# vem procurar aqui.
numeros = regua(
    (
        ItemDaRegua("Renda", brl(resumo.renda_real), f"base {brl(resumo.renda_base)}"),
        ItemDaRegua("Guardado", brl(resumo.guardado), f"de {brl(resumo.guardado_previsto)}"),
        ItemDaRegua(
            "Sobra", brl(resumo.sobra), "", "positivo" if resumo.sobra >= 0 else "negativo"
        ),
        ItemDaRegua(
            "Restam" if restam >= 0 else "Passou",
            brl(abs(restam)),
            "do previsto",
            "dentro" if restam >= 0 else "fora",
        ),
    )
)
uso = barras(
    (
        Barra(
            "Gasto do previsto",
            _razao(resumo.gasto, resumo.gasto_previsto),
            f"{_razao(resumo.gasto, resumo.gasto_previsto):.0%}",
            tom_do_mes,
        ),
    )
)
principal = destaque(
    "Gasto do mês",
    brl(resumo.gasto),
    f"de {brl(resumo.gasto_previsto)} previstos",
    tom_do_mes,
    numeros,
    corpo=uso,
)

variaveis_do_mes = sorted(
    (i for i in linhas_do_mes if i.natureza == "variável" and i.previsto > 0),
    key=lambda i: i.gasto / i.previsto,
    reverse=True,
)
perto_do_limite = quadro(
    "Mais perto do limite",
    lista(
        [
            Grupo(
                [
                    Linha(
                        i.categoria,
                        brl(i.gasto),
                        f"de {brl(i.previsto)}",
                        icone=icone_do_grupo(i.grupo)[0],
                        cor=icone_do_grupo(i.grupo)[1],
                        tom=VISUAL_DO_ESTADO[i.estado][0],
                        progresso=_razao(i.gasto, i.previsto),
                    )
                    for i in variaveis_do_mes[:4]
                ]
            )
        ]
    ),
    "variáveis",
)
acima = (
    alertas(
        [
            Alerta(
                "informativo",
                f"{brl(resumo.renda_acima_do_previsto)} acima da renda prevista",
                "Você decide para onde vai: guardar, investir ou gastar.",
            )
        ],
        compacto=True,
    )
    if resumo.renda_acima_do_previsto > 0
    else ""
)
st.html(colunas(principal, acima + perto_do_limite, proporcao="principal"))

aba_gasto, aba_guardado, aba_previsto = st.tabs(["Gasto", "Guardado", "Previsto"])

with aba_gasto:
    linhas = linhas_do_mes
    grupos = []
    for grupo, itens in groupby(linhas, key=lambda linha: linha.grupo):
        do_grupo = list(itens)
        do_mes = [i for i in do_grupo if i.natureza != "cofrinho"]
        # Gasto do salário em categoria com cofrinho pesa no mês; o previsto dela é a
        # inserção no cofrinho (está em Guardado), então não entra no previsto de gasto.
        gasto = sum((i.gasto for i in do_grupo), Decimal(0))
        previsto = sum((i.previsto for i in do_mes), Decimal(0))
        # O estado do grupo vem do que é variável: fixo em 100% é o esperado.
        variaveis = [i for i in do_mes if i.natureza == "variável"]
        if variaveis:
            estado_grupo = estado_do_gasto(
                sum((i.gasto for i in variaveis), Decimal(0)),
                sum((i.previsto for i in variaveis), Decimal(0)),
            )
        else:
            estado_grupo = Estado.ESTOUROU if gasto > previsto else Estado.OK
        tom, selo = VISUAL_DO_ESTADO[estado_grupo]
        icone, cor = icone_do_grupo(grupo)
        categorias = []
        for i in do_grupo:
            if i.natureza == "cofrinho":
                # Três modalidades: para o cofrinho, do cofrinho, do salário.
                fora = i.fora_do_previsto
                categorias.append(
                    Linha(
                        i.categoria,
                        brl(i.do_salario),
                        f"{brl(i.para_cofrinho)} de {brl(i.previsto)} postos no cofrinho "
                        f"{i.cofrinho} · {brl(i.financiado_por_cofrinho)} gastos do cofrinho",
                        selo=("do salário", "warn") if fora > 0 else ("cofrinho", "informativo"),
                        tom="perto" if fora > 0 else "neutro",
                        valor_detalhe="do salário",
                    )
                )
                continue
            estado_i = i.estado
            if i.natureza == "fixa" and estado_i is Estado.ATENCAO:
                estado_i = Estado.OK  # mensalidade chegando a 100% não é alerta
            tom_i, selo_i = VISUAL_DO_ESTADO[estado_i]
            # Nome próprio: `selo` já é o do grupo, logo acima.
            selo_da_categoria: tuple[str, str] | None = (
                selo_i if estado_i is not Estado.OK else None
            )
            if i.natureza == "fixa" and selo_da_categoria is None:
                selo_da_categoria = ("fixo", "informativo")
            categorias.append(
                Linha(
                    i.categoria,
                    brl(i.gasto),
                    f"de {brl(i.previsto)}"
                    + (
                        f" · {brl(i.financiado_por_cofrinho)} pagos com cofrinho"
                        if i.financiado_por_cofrinho
                        else ""
                    ),
                    tom=tom_i,
                    selo=selo_da_categoria,
                    progresso=_razao(i.gasto, i.previsto),
                )
            )
        grupos.append(
            Dobra(
                grupo,
                brl(gasto),
                f"de {brl(previsto)} · {len(do_grupo)} categorias",
                categorias,
                icone=icone,
                cor=cor,
                tom=tom,
                progresso=_razao(gasto, previsto),
                selo=selo if tom != "dentro" else None,
            )
        )
    st.html(dobras(grupos))
    st.caption(
        "Toque num grupo para ver as categorias. Despesa paga com dinheiro de cofrinho "
        "aparece na categoria, mas não conta no gasto do mês."
    )

with aba_guardado:
    st.html(
        lista(
            [
                Grupo(
                    [
                        Linha(
                            meta.destino,
                            brl(meta.transferido),
                            f"de {brl(meta.planejado)} planejados"
                            + (
                                f" · mais {brl(meta.devolucao)} devolvidos, que não contam "
                                "como guardado novo"
                                if meta.devolucao > 0
                                else ""
                            ),
                            icone="savings",
                            cor=2,
                            tom="dentro" if meta.transferido >= meta.planejado else "neutro",
                            progresso=_razao(meta.transferido, meta.planejado),
                        )
                        for meta in dados.metas_de_guardado(mes)
                    ]
                )
            ]
        )
    )
    st.caption("Transferido para reserva, cofrinhos e investimentos. Não é gasto.")

with aba_previsto:
    st.caption(
        "O previsto é um modelo que se repete todo mês. Preencha 'Ajuste deste mês' só "
        "nos meses que fogem do padrão."
    )
    editado = st.data_editor(
        [
            {
                "Categoria": item.categoria,
                "Padrão": brl(item.padrao),
                "Ajuste deste mês": brl(item.ajuste_do_mes) if item.ajuste_do_mes else "",
            }
            for item in dados.modelo_de_previsto(mes)
        ],
        hide_index=True,
        width="stretch",
        disabled=("Categoria",),
        key="editor_previsto",
    )
    if st.button("Salvar previsto", key="salvar_previsto"):
        # TODO(claude-code): budgeting.application.salvar_previsto. Ler os valores com
        # `app.formatacao.ler_valor` (nunca float) e gravar o padrão no modelo recorrente
        # e os ajustes em `budgets` para este mês.
        st.toast("Exemplo: nada foi gravado. Falta ligar budgeting.salvar_previsto.")
