"""Blocos de leitura da interface v2: destaque, régua, lista de valores e alerta.

Cada função devolve HTML (escapado) para um `st.html`. Um bloco inteiro num
`st.html` só evita o espaçamento que o Streamlit põe entre elementos e deixa o
desenho com o CSS de `app/estilo/componentes.css`.

Revisão de 2026-10-29: o Pedro viu a v1 rodando e achou "cards iguais demais",
"cara de planilha" e "pouca cor". Daí: um destaque por tela, régua sem moldura,
lista com ícone colorido no lugar de tabela, e alerta com cor de gravidade.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from html import escape
from typing import Literal

Tom = Literal["dentro", "perto", "fora", "positivo", "negativo", "neutro"]
Gravidade = Literal["critico", "atencao", "informativo"]

# Ícone (Material Symbols, já carregado pelo Streamlit) e cor da paleta (1 a 6) por
# grupo de categoria e por tipo de conta. A cor 6 (cinza) é sempre "Outros".
ICONE_DO_GRUPO: dict[str, tuple[str, int]] = {
    "Alimentação": ("restaurant", 4),
    "Transporte": ("directions_car", 3),
    "Lazer": ("sports_esports", 2),
    "Esporte": ("sports_mma", 5),
    "Compras": ("shopping_bag", 1),
    "Contas e taxas": ("receipt_long", 5),
    "Casa": ("home", 3),
    "Emergência": ("emergency", 4),
    "Trabalho": ("work", 1),
    "Família": ("family_restroom", 2),
    "Investimentos": ("trending_up", 3),
    "Outros": ("more_horiz", 6),
}


def icone_do_grupo(grupo: str | None) -> tuple[str, int]:
    return ICONE_DO_GRUPO.get(grupo or "Outros", ("more_horiz", 6))


def _icone(nome: str, cor: int) -> str:
    return (
        f'<span class="fin-ic fin-ic--{cor}" aria-hidden="true">'
        f'<span class="fin-simbolo">{escape(nome)}</span></span>'
    )


# ------------------------------------------------------------------------- destaque


def destaque(
    rotulo: str,
    valor: str,
    contexto: str = "",
    tom: Tom = "neutro",
    rodape: str = "",
    *,
    corpo: str = "",
) -> str:
    """O número que decide a tela. Um por tela (princípio 1 do brief).

    `rodape` é HTML já montado (em geral uma `regua`) que fica dentro do bloco,
    colado embaixo: os números que explicam o destaque moram com ele. `corpo`,
    também HTML pronto, fica logo abaixo do contexto.
    """
    contexto_html = f'<p class="fin-destaque__contexto">{escape(contexto)}</p>' if contexto else ""
    rodape_html = f'<div class="fin-destaque__rodape">{rodape}</div>' if rodape else ""
    return (
        f'<section class="fin-destaque fin-destaque--{tom}">'
        f'<div><p class="fin-rotulo">{escape(rotulo)}</p>'
        f'<p class="fin-destaque__valor fin-valor">{escape(valor)}</p>'
        f"{contexto_html}{corpo}</div>{rodape_html}</section>"
    )


@dataclass(frozen=True, slots=True)
class Barra:
    rotulo: str
    fracao: float  # 0 a 1; acima de 1 a barra enche e o tom avisa
    texto: str
    tom: Tom | None = None  # None = cor do acento; "neutro" = cinza de referência


def barras(itens: Sequence[Barra]) -> str:
    """Barras rotuladas para comparar ritmos (gasto do mês contra o mês que passou).

    O número vai escrito ao lado: a barra nunca é a única fonte da informação.
    """
    linhas = "".join(
        '<div class="fin-barras__linha">'
        f'<span class="fin-barras__rotulo">{escape(b.rotulo)}</span>'
        f'<span class="fin-lista__barra{f" fin-lista__barra--{b.tom}" if b.tom else ""}">'
        f'<span style="width:{max(0.0, min(b.fracao, 1.0)) * 100:.0f}%"></span></span>'
        f'<span class="fin-barras__texto fin-valor">{escape(b.texto)}</span>'
        "</div>"
        for b in itens
    )
    return f'<div class="fin-barras">{linhas}</div>'


def quadro(titulo: str, corpo: str, acao: str = "") -> str:
    """Bloco com fundo de superfície e título pequeno: o lado do painel."""
    acao_html = f'<span class="fin-legenda">{escape(acao)}</span>' if acao else ""
    return (
        f'<section class="fin-quadro"><h3 class="fin-quadro__titulo">'
        f"<span>{escape(titulo)}</span>{acao_html}</h3>{corpo}</section>"
    )


def colunas(*blocos: str, proporcao: Literal["iguais", "principal"] = "iguais") -> str:
    """Blocos lado a lado no desktop, empilhados no celular, sempre da mesma altura.

    Uma grade só em CSS (e não `st.columns`): é o que garante a mesma altura
    nas colunas, o pedido de 2026-10-29 sobre cartões desalinhados.
    `proporcao`: "iguais" ou "principal" (3 para 2, o destaque à esquerda).
    """
    itens = "".join(f'<div class="fin-colunas__item">{b}</div>' for b in blocos if b)
    return f'<div class="fin-colunas fin-colunas--{proporcao}">{itens}</div>'


# --------------------------------------------------------------------------- régua


@dataclass(frozen=True, slots=True)
class ItemDaRegua:
    rotulo: str
    valor: str
    detalhe: str = ""
    tom: Tom = "neutro"


def regua(itens: Sequence[ItemDaRegua]) -> str:
    """Três ou quatro números que explicam o destaque. Sem moldura, sem cartão."""
    celulas = "".join(
        f'<div class="fin-regua__item fin-regua__item--{i.tom}">'
        f'<span class="fin-rotulo">{escape(i.rotulo)}</span>'
        f'<span class="fin-regua__valor fin-valor">{escape(i.valor)}</span>'
        + (f'<span class="fin-legenda">{escape(i.detalhe)}</span>' if i.detalhe else "")
        + "</div>"
        for i in itens
    )
    return f'<div class="fin-regua">{celulas}</div>'


# ---------------------------------------------------------------- lista de valores


@dataclass(frozen=True, slots=True)
class Linha:
    titulo: str
    valor: str
    detalhe: str = ""
    icone: str | None = None
    cor: int = 6
    tom: Tom = "neutro"
    selo: tuple[str, str] | None = None  # (texto, classe: ok|warn|over|critico|...)
    valor_detalhe: str = ""
    tom_detalhe: Tom = "neutro"  # cor só do detalhe (ex.: variação), não do valor
    progresso: float | None = None  # 0 a 1, barra fina sob a linha
    tom_barra: Tom | None = None  # cor só da barra; None = a mesma do valor


@dataclass(frozen=True, slots=True)
class Grupo:
    linhas: Sequence[Linha]
    titulo: str = ""
    total: str = ""


def _linha(linha: Linha) -> str:
    icone = _icone(linha.icone, linha.cor) if linha.icone else ""
    selo = ""
    if linha.selo:
        texto, classe = linha.selo
        selo = f'<span class="fin-selo fin-selo--{escape(classe)}">{escape(texto)}</span>'
    detalhe = f'<span class="fin-legenda">{escape(linha.detalhe)}</span>' if linha.detalhe else ""
    valor_detalhe = (
        f'<span class="fin-legenda fin-valor--{linha.tom_detalhe}">'
        f"{escape(linha.valor_detalhe)}</span>"
        if linha.valor_detalhe
        else ""
    )
    barra = ""
    if linha.progresso is not None:
        largura = max(0.0, min(linha.progresso, 1.0)) * 100
        barra = (
            f'<span class="fin-lista__barra fin-lista__barra--{linha.tom_barra or linha.tom}">'
            f'<span style="width:{largura:.0f}%"></span></span>'
        )
    return (
        '<li class="fin-lista__linha">'
        f"{icone}"
        '<span class="fin-lista__texto">'
        f'<span class="fin-lista__titulo">{escape(linha.titulo)}{selo}</span>{detalhe}{barra}'
        "</span>"
        '<span class="fin-lista__valor">'
        f'<span class="fin-valor fin-valor--{linha.tom}">{escape(linha.valor)}</span>'
        f"{valor_detalhe}"
        "</span></li>"
    )


def lista(grupos: Sequence[Grupo]) -> str:
    """Linhas de app, não de planilha: ícone, nome e detalhe, valor à direita."""
    partes = []
    for grupo in grupos:
        cabecalho = ""
        if grupo.titulo:
            total = f'<span class="fin-valor">{escape(grupo.total)}</span>' if grupo.total else ""
            cabecalho = (
                f'<header class="fin-lista__cabecalho"><span>{escape(grupo.titulo)}</span>'
                f"{total}</header>"
            )
        linhas = "".join(_linha(linha) for linha in grupo.linhas)
        partes.append(f'<section class="fin-lista">{cabecalho}<ul>{linhas}</ul></section>')
    return "".join(partes)


# --------------------------------------------------------------------------- alerta


ICONE_DA_GRAVIDADE: dict[Gravidade, str] = {
    "critico": "error",
    "atencao": "warning",
    "informativo": "info",
}
ROTULO_DA_GRAVIDADE: dict[Gravidade, str] = {
    "critico": "Crítico",
    "atencao": "Atenção",
    "informativo": "Informativo",
}


@dataclass(frozen=True, slots=True)
class Acao:
    """O que resolve o alerta, direto do item (RF20).

    `destino` é "pagina:<caminho do arquivo>" ou "pagar:<nome da conta recorrente>".
    """

    rotulo: str
    destino: str
    icone: str = "arrow_forward"


@dataclass(frozen=True, slots=True)
class Alerta:
    gravidade: Gravidade
    titulo: str
    texto: str
    valor: str = ""
    # Identidade estável entre execuções: é por ela que "lembrar amanhã" e
    # "resolvido" sabem de qual item se trata.
    chave: str = ""
    acao: Acao | None = None


def corpo_do_alerta(a: Alerta) -> str:
    """O miolo de um alerta, sem a moldura: a moldura é o container com os botões."""
    return (
        '<div class="fin-alerta fin-alerta--solto">'
        f'<span class="fin-simbolo fin-alerta__icone fin-alerta__icone--{a.gravidade}"'
        f' aria-hidden="true">{ICONE_DA_GRAVIDADE[a.gravidade]}</span>'
        '<span class="fin-alerta__texto">'
        f'<span class="fin-alerta__gravidade fin-alerta__gravidade--{a.gravidade}">'
        f"{ROTULO_DA_GRAVIDADE[a.gravidade]}</span>"
        f'<span class="fin-alerta__titulo">{escape(a.titulo)}</span>'
        f'<span class="fin-legenda">{escape(a.texto)}</span>'
        "</span>"
        + (f'<span class="fin-valor fin-alerta__valor">{escape(a.valor)}</span>' if a.valor else "")
        + "</div>"
    )


def alertas(itens: Sequence[Alerta], *, compacto: bool = False) -> str:
    """Pendências com destaque de verdade: fundo e borda na cor da gravidade.

    A cor nunca vem sozinha: ícone e rótulo escrito ("Crítico", "Atenção").
    """
    if not itens:
        return ""
    cartoes = "".join(
        f'<li class="fin-alerta fin-alerta--{a.gravidade}">'
        f'<span class="fin-simbolo fin-alerta__icone" aria-hidden="true">'
        f"{ICONE_DA_GRAVIDADE[a.gravidade]}</span>"
        '<span class="fin-alerta__texto">'
        f'<span class="fin-alerta__gravidade">{ROTULO_DA_GRAVIDADE[a.gravidade]}</span>'
        f'<span class="fin-alerta__titulo">{escape(a.titulo)}</span>'
        f'<span class="fin-legenda">{escape(a.texto)}</span>'
        "</span>"
        + (f'<span class="fin-valor fin-alerta__valor">{escape(a.valor)}</span>' if a.valor else "")
        + "</li>"
        for a in itens
    )
    classe = "fin-alertas fin-alertas--compacto" if compacto else "fin-alertas"
    return f'<ul class="{classe}">{cartoes}</ul>'


def secao(titulo: str, acao: str = "") -> str:
    """Título de seção: texto em peso, régua fina, ação opcional à direita."""
    acao_html = f'<span class="fin-legenda">{escape(acao)}</span>' if acao else ""
    return f'<h3 class="fin-secao"><span>{escape(titulo)}</span>{acao_html}</h3>'


# ------------------------------------------------------------------ grupo recolhível


@dataclass(frozen=True, slots=True)
class Dobra:
    """Grupo que mostra só o resumo e abre com um toque (Orçamento por grupo)."""

    titulo: str
    valor: str
    detalhe: str
    linhas: Sequence[Linha]
    icone: str = "more_horiz"
    cor: int = 6
    tom: Tom = "neutro"
    progresso: float | None = None
    selo: tuple[str, str] | None = None


def dobras(itens: Sequence[Dobra]) -> str:
    """`<details>` nativo: abre e fecha sem script, e o teclado já funciona.

    Revisão de 2026-10-29: Orçamento "extenso demais" — cada grupo fechado mostra
    só o total, a barra e o selo; as categorias aparecem ao abrir.
    """
    partes = []
    for d in itens:
        resumo = (
            _linha(
                Linha(
                    d.titulo,
                    d.valor,
                    d.detalhe,
                    icone=d.icone,
                    cor=d.cor,
                    tom=d.tom,
                    selo=d.selo,
                    progresso=d.progresso,
                )
            )
            .replace("<li ", "<div ", 1)
            .removesuffix("</li>")
            + "</div>"
        )
        linhas = "".join(_linha(linha) for linha in d.linhas)
        partes.append(
            f'<details class="fin-dobra"><summary>{resumo}'
            '<span class="fin-simbolo fin-dobra__seta" aria-hidden="true">expand_more</span>'
            f'</summary><ul class="fin-dobra__corpo">{linhas}</ul></details>'
        )
    return f'<section class="fin-lista">{"".join(partes)}</section>'


# ------------------------------------------------------------ quanto cabe por categoria


@dataclass(frozen=True, slots=True)
class Folga:
    categoria: str
    livre: str  # "R$ 95,00" ou "passou R$ 6,75"
    usado: float  # 0 a 1+, fração do previsto já gasta
    tom: Tom
    icone: str
    cor: int


def folgas(itens: Sequence[Folga]) -> str:
    """Grade compacta: quanto ainda cabe em cada categoria, para bater o olho.

    Pedido do Pedro em 2026-10-29: além do total, ver de cara em que categoria
    ainda dá para gastar. Uma célula por categoria, a barra mostra quanto do
    previsto já foi; a cor do valor é o estado (dentro, perto, fora).
    """
    celulas = "".join(
        f'<li class="fin-folga fin-folga--{f.tom}">'
        f"{_icone(f.icone, f.cor)}"
        '<span class="fin-folga__texto">'
        f'<span class="fin-folga__nome">{escape(f.categoria)}</span>'
        f'<span class="fin-valor fin-valor--{f.tom} fin-folga__valor">{escape(f.livre)}</span>'
        + (
            f'<span class="fin-lista__barra fin-lista__barra--{f.tom}">'
            f'<span style="width:{max(0.0, min(f.usado, 1.0)) * 100:.0f}%"></span></span>'
            if f.tom != "neutro"  # saldo de cofrinho: não há "quanto já foi" a medir
            else ""
        )
        + "</span></li>"
        for f in itens
    )
    return f'<ul class="fin-folgas">{celulas}</ul>'
