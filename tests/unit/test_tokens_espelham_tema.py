"""Os tokens de CSS e o tema do Streamlit dizem as mesmas cores?

As cores da interface vivem em dois arquivos: `app/estilo/tokens.css` (o que o
CSS próprio usa) e `.streamlit/config.toml` (o que os widgets do Streamlit
usam). Se um mudar sem o outro, a tela passa a ter dois grafites, ou um verde de
"dentro do previsto" diferente no selo e no `st.badge` — e nada quebra, só fica
errado. Este teste é o que impede isso.

Também transforma em verificação os contrastes que o `tokens.css` declara nos
comentários: 4,5:1 para texto e 3:1 para contorno de componente (WCAG 2.1).
"""

import re
import tomllib
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
TOKENS = RAIZ / "app" / "estilo" / "tokens.css"
CONFIG = RAIZ / ".streamlit" / "config.toml"

# token do CSS  →  chaves do tema do Streamlit que devem ter o mesmo valor
ESPELHO: dict[str, tuple[str, ...]] = {
    "fundo": ("backgroundColor",),
    "superficie": ("secondaryBackgroundColor", "dataframeHeaderBackgroundColor"),
    "texto": ("textColor",),
    "texto-2": ("dataframeHeaderTextColor", "grayTextColor"),
    "acento": ("primaryColor", "linkColor"),
    "borda-campo": ("borderColor",),
    "regua": ("dataframeBorderColor",),
    "dentro": ("greenColor", "greenTextColor"),
    "dentro-fundo": ("greenBackgroundColor",),
    "perto": ("yellowColor", "yellowTextColor"),
    "perto-fundo": ("yellowBackgroundColor",),
    "fora": ("redColor", "redTextColor"),
    "fora-fundo": ("redBackgroundColor",),
}

# (frente, fundo, mínimo) — texto 4,5:1; contorno de componente 3:1
CONTRASTES: tuple[tuple[str, str, float], ...] = (
    ("texto", "fundo", 4.5),
    ("texto-2", "fundo", 4.5),
    ("texto-2", "superficie", 4.5),
    ("texto-3", "fundo", 4.5),
    ("texto-3", "superficie", 4.5),
    ("texto-3", "poco", 4.5),
    ("acento", "fundo", 4.5),
    ("acento-texto", "acento", 4.5),
    ("dentro", "fundo", 4.5),
    ("perto", "fundo", 4.5),
    ("fora", "fundo", 4.5),
    ("dentro", "dentro-fundo", 4.5),
    ("perto", "perto-fundo", 4.5),
    ("fora", "fora-fundo", 4.5),
    ("tarja-texto", "tarja-fundo", 4.5),
    ("borda-campo", "poco", 3.0),
    ("borda-campo", "fundo", 3.0),
    ("foco", "fundo", 3.0),
    ("acento", "acento-suave", 4.5),
)


def _bloco(css: str, seletor: str) -> dict[str, str]:
    """Variáveis `--fin-*` com cor hexadecimal no primeiro bloco do seletor."""
    achado = re.search(
        rf"^\s*{re.escape(seletor)}\s*\{{(.*?)^\s*\}}", css, re.MULTILINE | re.DOTALL
    )
    assert achado, f"bloco {seletor!r} não encontrado em tokens.css"
    return {
        nome: valor.lower()
        for nome, valor in re.findall(
            r"--fin-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;", achado.group(1)
        )
    }


def _paletas() -> dict[str, dict[str, str]]:
    css = TOKENS.read_text(encoding="utf-8")
    return {
        "light": _bloco(css, ":root"),
        "dark": _bloco(css, '[data-theme="dark"]'),
    }


def _luminancia(cor: str) -> float:
    canais = [int(cor[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _contraste(a: str, b: str) -> float:
    claro, escuro = sorted((_luminancia(a), _luminancia(b)), reverse=True)
    return (claro + 0.05) / (escuro + 0.05)


@pytest.mark.parametrize("modo", ["light", "dark"])
def test_tema_do_streamlit_espelha_os_tokens(modo: str) -> None:
    tokens = _paletas()[modo]
    tema = tomllib.loads(CONFIG.read_text(encoding="utf-8"))["theme"][modo]
    divergencias = [
        f"--fin-{token}={tokens[token]} ≠ theme.{modo}.{chave}={tema.get(chave)}"
        for token, chaves in ESPELHO.items()
        for chave in chaves
        if str(tema.get(chave, "")).lower() != tokens[token]
    ]
    assert not divergencias, "\n".join(divergencias)


def test_os_dois_blocos_do_modo_escuro_sao_iguais() -> None:
    """O escuro aparece duas vezes: por `[data-theme]` e por preferência do sistema."""
    css = TOKENS.read_text(encoding="utf-8")
    assert _bloco(css, '[data-theme="dark"]') == _bloco(css, ':root:not([data-theme="light"])')


@pytest.mark.parametrize("modo", ["light", "dark"])
@pytest.mark.parametrize(("frente", "fundo", "minimo"), CONTRASTES)
def test_contraste_minimo(modo: str, frente: str, fundo: str, minimo: float) -> None:
    paleta = _paletas()[modo]
    valor = _contraste(paleta[frente], paleta[fundo])
    assert valor >= minimo, (
        f"{modo}: --fin-{frente} sobre --fin-{fundo} = {valor:.2f}:1 (mínimo {minimo}:1)"
    )


@pytest.mark.parametrize("modo", ["light", "dark"])
def test_paleta_de_grafico_espelha_o_tema(modo: str) -> None:
    """A paleta categórica do RF22 é a mesma no CSS e no `chartCategoricalColors`."""
    tokens = _paletas()[modo]
    paleta = [tokens[f"grafico-cat-{i}"] for i in range(1, 7)]
    tema = tomllib.loads(CONFIG.read_text(encoding="utf-8"))["theme"][modo]
    assert [c.lower() for c in tema["chartCategoricalColors"]] == paleta


@pytest.mark.parametrize("modo", ["light", "dark"])
def test_paleta_de_grafico_se_le_contra_o_fundo(modo: str) -> None:
    """Cada cor de série é um elemento gráfico: 3:1 contra o fundo (WCAG 1.4.11)."""
    paleta = _paletas()[modo]
    baixos = {
        i: round(_contraste(paleta[f"grafico-cat-{i}"], paleta["fundo"]), 2)
        for i in range(1, 7)
        if _contraste(paleta[f"grafico-cat-{i}"], paleta["fundo"]) < 3
    }
    assert not baixos, baixos


def test_componentes_css_so_usa_tokens_definidos() -> None:
    """Um `var(--fin-…)` sem definição vira valor vazio sem erro nenhum.

    Foi o que aconteceu na troca de tokens da v1 para a v2: o componentes.css
    continuou com 14 nomes antigos e os estilos sumiram em silêncio.
    """
    tokens = TOKENS.read_text(encoding="utf-8")
    definidos = set(re.findall(r"--fin-([a-z0-9-]+)\s*:", tokens))
    componentes = (TOKENS.parent / "componentes.css").read_text(encoding="utf-8")
    usados = set(re.findall(r"var\(--fin-([a-z0-9-]+)", componentes))
    assert not usados - definidos, sorted(usados - definidos)


def _snake(nome: str) -> str:
    return re.sub(r"(?<!^)([A-Z])", r"_\1", nome).lower()


def _repetido(campo: object) -> bool:
    """Lista no protocolo? O protobuf 6 (upb) trocou `label` por `is_repeated`."""
    if hasattr(campo, "is_repeated"):
        return bool(getattr(campo, "is_repeated"))  # noqa: B009 — `object` para o mypy
    from google.protobuf.descriptor import FieldDescriptor

    return bool(getattr(campo, "label", None) == FieldDescriptor.LABEL_REPEATED)


def test_valores_do_tema_tem_o_tipo_que_o_streamlit_espera() -> None:
    """Chave válida com valor de tipo errado derruba o tema inteiro, sem erro na tela.

    Aconteceu com `metricValueFontSize = 32`: o campo no protocolo é texto, o
    `setattr` do protobuf falha e o app abre com o tema padrão do Streamlit —
    claro e escuro. O `_validar_tema` só conferia se a chave existia.
    """
    proto = pytest.importorskip("streamlit.proto.NewSession_pb2")
    from google.protobuf.descriptor import FieldDescriptor

    campos = proto.CustomThemeConfig.DESCRIPTOR.fields_by_name
    esperado = {
        FieldDescriptor.TYPE_STRING: str,
        FieldDescriptor.TYPE_BOOL: bool,
        FieldDescriptor.TYPE_INT32: int,
        FieldDescriptor.TYPE_INT64: int,
        FieldDescriptor.TYPE_FLOAT: float,
        FieldDescriptor.TYPE_DOUBLE: float,
    }
    tema = tomllib.loads(CONFIG.read_text(encoding="utf-8"))["theme"]
    secoes = {"theme": {k: v for k, v in tema.items() if not isinstance(v, dict)}}
    secoes |= {f"theme.{k}": v for k, v in tema.items() if isinstance(v, dict)}
    errados = []
    for secao, opcoes in secoes.items():
        for nome, valor in opcoes.items():
            campo = campos.get(_snake(nome))
            if campo is None or _repetido(campo):
                continue  # fontes e listas de cor são tratadas à parte pelo Streamlit
            tipo = esperado.get(campo.type)
            if tipo is None:
                continue
            # bool é subclasse de int em Python: True num campo int não pode passar.
            certo = isinstance(valor, tipo) and (tipo is bool or not isinstance(valor, bool))
            if not certo:
                errados.append(f"{secao}.{nome} = {valor!r} (esperado {tipo.__name__})")
    assert not errados, errados


@pytest.mark.parametrize(
    ("token", "px"),
    [
        ("xs", 12),
        ("sm", 14),
        ("base", 16),
        ("md", 18),
        ("lg", 21),
        ("xl", 26),
        ("2xl", 36),
        ("3xl", 48),
    ],
)
def test_escala_tipografica_em_px_reais(token: str, px: int) -> None:
    """`rem` é relativo ao `baseFontSize` do tema, que muda o font-size do <html>.

    A escala foi escrita contando com 16px e saiu 6% menor na tela; o teste
    amarra cada passo ao pixel que o comentário promete.
    """
    raiz = tomllib.loads(CONFIG.read_text(encoding="utf-8"))["theme"]["baseFontSize"]
    css = TOKENS.read_text(encoding="utf-8")
    achado = re.search(rf"--fin-t-{token}:\s*([0-9.]+)rem", css)
    assert achado, f"--fin-t-{token} não está em rem"
    rem = float(achado.group(1))
    assert round(rem * raiz) == px


@pytest.mark.parametrize("arquivo", ["tokens.css", "componentes.css"])
def test_css_nao_tem_sinal_de_menor(arquivo: str) -> None:
    """O CSS vai dentro de `<style>` por `st.html`, que passa por sanitização de HTML.

    Um comentário com `<html>` bastou para o navegador descartar o estilo
    inteiro, sem erro. `>` é seletor de CSS válido; `<` não tem uso em CSS.
    """
    assert "<" not in (TOKENS.parent / arquivo).read_text(encoding="utf-8")
