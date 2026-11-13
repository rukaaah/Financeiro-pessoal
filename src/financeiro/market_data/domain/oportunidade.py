"""Medidor diário de oportunidade de compra dos FIIs em carteira (ADR-022).

Puro, só stdlib. A conta é determinística e vem antes da IA: a nota de cada fundo sai
do histórico de preço, P/VP e DY guardados pelo job de cotações (ADR-020). A IA só
escreve o motivo em português e pode rebaixar o veredito, nunca subir. Toda conta com
número que a IA escreve precisa estar nos fatos que ela recebeu; o resto é descartado.

Nota de 0 a 100, maior = mais barato contra o próprio histórico:

- 35 %: P/VP de hoje contra os P/VP do último ano (percentil; mais baixo = melhor);
- 25 %: desconto sobre o valor patrimonial (P/VP 0,70 vale tudo, 1,10 vale nada);
- 20 %: DY de 12 meses de hoje contra o do último ano (percentil; mais alto = melhor);
- 20 %: preço abaixo da média de 21 pregões (8 % abaixo vale tudo).

Peso de componente sem dado é redistribuído. "Um dos grandes dias do ano" exige pelo
menos 120 pregões de histórico, nota de hoje no topo de 5 % das notas do último ano e
nota 65 ou mais. Com menos histórico, o medidor diz que o histórico é curto.
"""

import json
import re
import statistics
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal

JANELA = 252  # pregões num ano
MEDIA_CURTA = 21  # pregões num mês
MIN_PREGOES = 20
MIN_PREGOES_GRANDE_DIA = 120
LIQUIDEZ_MINIMA = Decimal(500_000)
VEREDITOS = ("grande_dia", "bom_preco", "esperar", "sem_dados")
PESOS = {
    "pvp_hist": Decimal("0.35"),
    "pvp_abs": Decimal("0.25"),
    "dy_hist": Decimal("0.20"),
    "queda": Decimal("0.20"),
}


@dataclass(frozen=True, slots=True)
class Pregao:
    dia: date
    preco: Decimal
    pvp: Decimal | None = None
    dy: Decimal | None = None  # DY 12m em pontos percentuais
    volume: Decimal | None = None


@dataclass(frozen=True, slots=True)
class Selic:
    atual: Decimal  # % ao ano
    ha_90_dias: Decimal | None

    @property
    def direcao(self) -> str:
        if self.ha_90_dias is None:
            return "sem histórico"
        if self.atual < self.ha_90_dias:
            return "em queda"
        if self.atual > self.ha_90_dias:
            return "em alta"
        return "mantida"


@dataclass(frozen=True, slots=True)
class Sinal:
    ticker: str
    dia: date
    preco: Decimal
    nota: int | None
    percentil: int | None  # % das notas do último ano abaixo da de hoje
    pregoes: int
    veredito: str
    motivos: list[str] = field(default_factory=list)
    riscos: list[str] = field(default_factory=list)
    preco_alvo: Decimal | None = None  # se o P/VP voltar à mediana do ano
    fatos: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Panorama:
    dia: date
    tendencia: str  # alta | queda | lateral | sem_dados
    fundos: int
    acima_da_media: int
    variacao_mediana_21d: Decimal | None
    subindo: list[str] = field(default_factory=list)
    caindo: list[str] = field(default_factory=list)


def _q(v: Decimal, casas: str = "0.01") -> Decimal:
    return v.quantize(Decimal(casas), ROUND_HALF_EVEN)


def br(v: Decimal, casas: int = 2) -> str:
    return f"{v:.{casas}f}".replace(".", ",")


def _limita(v: Decimal) -> Decimal:
    return min(Decimal(1), max(Decimal(0), v))


def _fracao(cond: list[bool]) -> Decimal:
    return Decimal(sum(cond)) / Decimal(len(cond))


def _nota(janela: list[Pregao]) -> int | None:
    """Nota do último pregão da janela, com o resto da janela como histórico."""
    hoje = janela[-1]
    partes: dict[str, Decimal] = {}
    pvps = [p.pvp for p in janela if p.pvp is not None]
    if hoje.pvp is not None:
        if len(pvps) >= MIN_PREGOES:
            partes["pvp_hist"] = _fracao([x >= hoje.pvp for x in pvps])
        partes["pvp_abs"] = _limita((Decimal("1.10") - hoje.pvp) / Decimal("0.40"))
    dys = [p.dy for p in janela if p.dy is not None]
    if hoje.dy is not None and len(dys) >= MIN_PREGOES:
        partes["dy_hist"] = _fracao([x <= hoje.dy for x in dys])
    curtos = janela[-MEDIA_CURTA:]
    if len(curtos) == MEDIA_CURTA:
        media = sum((p.preco for p in curtos), Decimal(0)) / MEDIA_CURTA
        partes["queda"] = _limita((1 - hoje.preco / media) / Decimal("0.08"))
    if not partes:
        return None
    peso = sum((PESOS[k] for k in partes), Decimal(0))
    total = sum((PESOS[k] * v for k, v in partes.items()), Decimal(0))
    return int(_q(total / peso * 100, "1"))


def avaliar(ticker: str, historico: list[Pregao]) -> Sinal:
    """Sinal do pregão mais recente. ``historico`` em qualquer ordem, um por dia."""
    serie = sorted(historico, key=lambda p: p.dia)[-JANELA:]
    if not serie:
        raise ValueError("histórico vazio")
    hoje = serie[-1]
    n = len(serie)
    fatos: dict[str, str] = {"preco": f"R$ {br(hoje.preco)}", "pregoes": str(n)}
    if n < MIN_PREGOES:
        return Sinal(
            ticker,
            hoje.dia,
            hoje.preco,
            None,
            None,
            n,
            "sem_dados",
            [f"Só {n} pregões guardados; o medidor precisa de {MIN_PREGOES}."],
            [],
            None,
            fatos,
        )

    notas = [_nota(serie[: i + 1]) for i in range(MIN_PREGOES - 1, n)]
    nota = notas[-1]
    validas = [x for x in notas[:-1] if x is not None]
    percentil = (
        int(_q(_fracao([x < nota for x in validas]) * 100, "1"))
        if nota is not None and validas
        else None
    )
    motivos: list[str] = []
    riscos: list[str] = []
    alvo: Decimal | None = None

    pvps = [p.pvp for p in serie if p.pvp is not None]
    if hoje.pvp is not None:
        fatos["pvp"] = br(hoje.pvp)
        if len(pvps) >= MIN_PREGOES:
            mediana = Decimal(statistics.median(pvps))
            alvo = _q(hoje.preco * mediana / hoje.pvp)
            fatos["pvp_mediana_ano"] = br(mediana)
            fatos["preco_se_pvp_voltar_a_mediana"] = f"R$ {br(alvo)}"
            fatos["variacao_ate_la"] = f"{br((alvo / hoje.preco - 1) * 100, 1)}%"
            minimo = min(pvps)
            baixa = _q(hoje.preco * minimo / hoje.pvp)
            fatos["pvp_minimo_ano"] = br(minimo)
            fatos["preco_se_pvp_for_ao_minimo"] = f"R$ {br(baixa)}"
            fatos["variacao_ate_o_minimo"] = f"{br((baixa / hoje.preco - 1) * 100, 1)}%"
            if hoje.pvp < mediana:
                motivos.append(f"P/VP {br(hoje.pvp)} abaixo da mediana do período ({br(mediana)})")
        if hoje.pvp < 1:
            motivos.append(f"cota {br((1 - hoje.pvp) * 100, 1)}% abaixo do valor patrimonial")
        elif hoje.pvp > Decimal("1.05"):
            riscos.append(f"P/VP {br(hoje.pvp)}: paga ágio sobre o patrimônio")
    if hoje.dy is not None:
        fatos["dy_12m"] = f"{br(hoje.dy, 1)}%"
        fatos["renda_12m_por_cota"] = f"R$ {br(hoje.dy * hoje.preco / 100)}"
    curtos = serie[-MEDIA_CURTA:]
    if len(curtos) == MEDIA_CURTA:
        media = sum((p.preco for p in curtos), Decimal(0)) / MEDIA_CURTA
        desvio = (hoje.preco / media - 1) * 100
        fatos["vs_media_21_pregoes"] = f"{br(desvio, 1)}%"
        if desvio <= -2:
            motivos.append(f"preço {br(-desvio, 1)}% abaixo da média de 21 pregões")
    vols = [p.volume for p in serie[-MEDIA_CURTA:] if p.volume is not None]
    liquidez_baixa = False
    if vols:
        liquidez = sum(vols, Decimal(0)) / len(vols)
        fatos["liquidez_media_dia"] = f"R$ {br(liquidez / 1000, 0)} mil"
        liquidez_baixa = liquidez < LIQUIDEZ_MINIMA
        if liquidez_baixa:
            riscos.append(f"liquidez de R$ {br(liquidez / 1000, 0)} mil/dia: difícil vender rápido")
    if nota is not None:
        fatos["nota"] = str(nota)
    if percentil is not None:
        fatos["percentil_no_periodo"] = f"{percentil}%"

    caro = hoje.pvp is not None and hoje.pvp > 1
    if nota is None:
        veredito = "sem_dados"
    elif (
        n >= MIN_PREGOES_GRANDE_DIA
        and percentil is not None
        and percentil >= 95
        and nota >= 65
        and not caro
    ):
        veredito = "grande_dia"
        motivos.insert(0, f"nota {nota}: entre os 5% dias mais baratos do período ({n} pregões)")
    elif nota >= 60 and not (hoje.pvp is not None and hoje.pvp > Decimal("1.05")):
        veredito = "bom_preco"
    else:
        veredito = "esperar"
    if veredito in ("grande_dia", "bom_preco") and liquidez_baixa:
        veredito = "esperar"
    if n < MIN_PREGOES_GRANDE_DIA:
        riscos.append(
            f"histórico de {n} pregões: curto para dizer se é um dos melhores dias do ano"
        )
    return Sinal(
        ticker, hoje.dia, hoje.preco, nota, percentil, n, veredito, motivos, riscos, alvo, fatos
    )


def panorama(series: dict[str, list[Pregao]]) -> Panorama:
    """Tendência entre os fundos acompanhados (não é o IFIX) no último pregão comum."""
    variacoes: dict[str, Decimal] = {}
    acima = 0
    ultimo: date | None = None
    for ticker, hist in series.items():
        s = sorted(hist, key=lambda p: p.dia)
        if len(s) <= MEDIA_CURTA:
            continue
        ultimo = max(ultimo or s[-1].dia, s[-1].dia)
        variacoes[ticker] = s[-1].preco / s[-1 - MEDIA_CURTA].preco - 1
        media = sum((p.preco for p in s[-MEDIA_CURTA:]), Decimal(0)) / MEDIA_CURTA
        acima += s[-1].preco > media
    if not variacoes or ultimo is None:
        dia = max((p.dia for h in series.values() for p in h), default=date.min)
        return Panorama(dia, "sem_dados", 0, 0, None)
    mediana = Decimal(statistics.median(variacoes.values()))
    parte = Decimal(acima) / len(variacoes)
    if mediana > Decimal("0.02") and parte >= Decimal("0.6"):
        tendencia = "alta"
    elif mediana < Decimal("-0.02") and parte <= Decimal("0.4"):
        tendencia = "queda"
    else:
        tendencia = "lateral"
    ordem = sorted(variacoes, key=lambda t: variacoes[t])
    return Panorama(
        ultimo,
        tendencia,
        len(variacoes),
        acima,
        _q(mediana * 100),
        [t for t in reversed(ordem) if variacoes[t] > Decimal("0.03")][:5],
        [t for t in ordem if variacoes[t] < Decimal("-0.03")][:5],
    )


# --- IA -------------------------------------------------------------------------------

SISTEMA = """\
Você lê os dados de mercado de um fundo imobiliário (FII) brasileiro e explica, para \
um cotista pessoa física e em português do Brasil, se os fatos de HOJE sustentam o \
veredito que a conta do app calculou. Você não é analista nem consultor de \
investimentos, e não fala como se fosse.

Como você trabalha:
1. Pesquise antes de falar: leia todos os fatos e o resumo dos documentos oficiais \
abaixo antes de concluir. Eles são a sua única fonte; você não tem internet.
2. Use só números que estão nos fatos. Não invente preço, P/VP, DY, Selic, data, \
percentual nem previsão numérica. Se falta dado, diga que falta.
3. Seja brutalmente honesto. Nunca concorde por concordar, nem com o veredito \
calculado: se os fatos não sustentam a compra, rebaixe e diga o porquê. Você pode \
rebaixar o veredito (grande_dia > bom_preco > esperar), nunca subir.
4. Preço caindo não é sinônimo de oportunidade: separe "barato" de "barato por um \
motivo" (vacância, inadimplência, alavancagem, emissão abaixo do VP, corte de \
rendimento, fato relevante ruim no resumo).
5. "Previsão" é cenário, não promessa, e sempre tem os dois lados: o preço se o P/VP \
voltar à mediana (preco_se_pvp_voltar_a_mediana) e o preço se o P/VP for ao mínimo do \
período (preco_se_pvp_for_ao_minimo), citando os dois valores dos fatos. Resposta com \
um lado só é descartada.
6. "riscos" nunca vem vazio: diga ao menos um motivo concreto para não comprar hoje.
7. Não preveja a Selic nem o Copom; use só a Selic e a direção que estão nos fatos.

Métricas de referência do mercado de FII (use para julgar, não para citar como dado \
do fundo):
- P/VP: abaixo de 1 = desconto sobre o patrimônio; acima de 1,05 = ágio. Fundo de \
papel costuma negociar perto de 1; tijolo com desconto grande pode refletir \
vacância ou ativos de pior qualidade.
- DY 12 meses: compare com a Selic dos fatos (dy_menos_selic); o Tesouro Selic é a \
alternativa de toda compra. Rendimento de FII é isento de IR para pessoa física, a \
Selic e o CDI não.
- Liquidez diária abaixo de R$ 500 mil: difícil sair rápido.
- Vacância física e financeira, inadimplência, LTV/alavancagem, concentração de \
inquilino e prazo dos contratos pesam mais que um dia de preço.
- IFIX é o índice de referência do setor; aqui a tendência é só dos fundos que o \
cotista acompanha, não do IFIX.

Responda só com JSON, sem texto fora dele:
{"veredito": "grande_dia|bom_preco|esperar", "motivo": "até 3 frases, citando os \
números dos fatos", "riscos": ["de 1 a 3 itens curtos"], "previsao": "até 2 frases \
com o cenário de alta e o de baixa, sem número que não esteja nos fatos"}"""


def mensagens(
    sinal: Sinal, pano: Panorama, selic: Selic | None, resumo: str | None
) -> list[dict[str, str]]:
    linhas = [
        f"Fundo {sinal.ticker}. Pregão de {sinal.dia:%d/%m/%Y}.",
        f"Veredito calculado: {sinal.veredito}.",
        "Fatos (únicos números permitidos):",
        *(f"- {k}: {v}" for k, v in fatos_para_ia(sinal, pano, selic).items()),
        "Motivos calculados: " + ("; ".join(sinal.motivos) or "nenhum"),
        "Riscos calculados: " + ("; ".join(sinal.riscos) or "nenhum"),
        "Resumo dos documentos oficiais recentes (Fundos.NET): " + (resumo or "sem resumo"),
    ]
    return [{"role": "system", "content": SISTEMA}, {"role": "user", "content": "\n".join(linhas)}]


def fatos_para_ia(sinal: Sinal, pano: Panorama, selic: Selic | None) -> dict[str, str]:
    fatos = dict(sinal.fatos)
    fatos["tendencia_dos_fundos_acompanhados"] = (
        f"{pano.tendencia} ({pano.acima_da_media} de {pano.fundos} acima da média de 21 pregões)"
    )
    if pano.variacao_mediana_21d is not None:
        fatos["variacao_mediana_21_pregoes"] = f"{br(pano.variacao_mediana_21d, 1)}%"
    if selic is not None:
        fatos["selic"] = f"{br(selic.atual)}% ao ano, {selic.direcao} em 90 dias"
        if sinal.fatos.get("dy_12m"):
            dy = Decimal(sinal.fatos["dy_12m"].rstrip("%").replace(",", "."))
            fatos["dy_menos_selic"] = f"{br(dy - selic.atual, 1)} p.p."
    return fatos


_NUMERO = re.compile(r"\d+(?:[.,]\d+)*")
_LIVRES = {"1", "2", "3", "5", "12", "21", "90", "100", "1,05", "0,70", "1,10"}


def _numeros(texto: str) -> set[str]:
    return {m.replace(".", ",") for m in _NUMERO.findall(texto)}


def _curto(valor: object, limite: int) -> str:
    return re.sub(r"\s+", " ", valor).strip()[:limite] if isinstance(valor, str) else ""


@dataclass(frozen=True, slots=True)
class Leitura:
    veredito: str
    motivo: str
    riscos: list[str]
    previsao: str


def _json(texto: str) -> dict[str, object] | None:
    inicio, fim = texto.find("{"), texto.rfind("}")
    try:
        dados = json.loads(texto[inicio : fim + 1]) if 0 <= inicio < fim else None
    except ValueError:
        return None
    return dados if isinstance(dados, dict) else None


def ler_resposta(
    resposta: str | dict[str, object], sinal: Sinal, fatos: dict[str, str]
) -> Leitura | None:
    """Valida a resposta. None se houver número fora dos fatos, veredito acima do calculado,
    nenhum risco ou previsão sem o cenário de alta e o de baixa."""
    dados = resposta if isinstance(resposta, dict) else _json(resposta)
    if dados is None:
        return None
    veredito = str(dados.get("veredito", ""))
    if veredito not in VEREDITOS[:3] or VEREDITOS.index(veredito) < VEREDITOS.index(sinal.veredito):
        return None
    motivo, previsao = _curto(dados.get("motivo"), 500), _curto(dados.get("previsao"), 320)
    brutos = dados.get("riscos")
    riscos = [
        r for r in (_curto(x, 160) for x in (brutos if isinstance(brutos, list) else [])) if r
    ][:3]
    if not motivo or not riscos:
        return None
    for chave in ("preco_se_pvp_voltar_a_mediana", "preco_se_pvp_for_ao_minimo"):
        if chave in fatos and not _numeros(fatos[chave]) & _numeros(previsao):
            return None
    permitidos = (
        _LIVRES
        | set().union(*(_numeros(v) for v in fatos.values()))
        | _numeros(sinal.ticker)
        | _numeros(f"{sinal.dia:%d/%m/%Y}")
    )
    if not _numeros(" ".join([motivo, previsao, *riscos])) <= permitidos:
        return None
    return Leitura(veredito, motivo, riscos, previsao)


def leitura_sem_ia(sinal: Sinal) -> Leitura:
    """Texto montado só com a conta, quando a IA falta ou é descartada."""
    if sinal.motivos:
        motivo = sinal.motivos[0][0].upper() + "; ".join(sinal.motivos)[1:] + "."
    else:
        motivo = "Nada no preço, no P/VP ou no DY de hoje destoa do próprio histórico."
    previsao = ""
    alvo = sinal.fatos.get("preco_se_pvp_voltar_a_mediana")
    if alvo:
        previsao = (
            f"Se o P/VP voltar à mediana do período, a cota iria a {alvo}"
            f" ({sinal.fatos['variacao_ate_la']}); se for ao mínimo do período, a"
            f" {sinal.fatos['preco_se_pvp_for_ao_minimo']}"
            f" ({sinal.fatos['variacao_ate_o_minimo']}). É cenário, não promessa."
        )
    return Leitura(sinal.veredito, motivo, sinal.riscos[:3], previsao)
