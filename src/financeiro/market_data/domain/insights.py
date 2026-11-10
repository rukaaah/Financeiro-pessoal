"""Notícias e insights dos FIIs a partir dos documentos oficiais do fundo (ADR-021).

Puro: escolhe os documentos que interessam ao cotista, monta o pedido à IA e valida
a resposta. A regra que não pode ser quebrada: nada de dado inventado. Toda data de
evento precisa estar escrita no documento que a IA cita; o que não confere é jogado fora.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime

# Categorias do Fundos.NET que dizem algo ao cotista. Informes periódicos ficam de
# fora: os números deles já chegam pelo informe mensal da CVM (ADR-020).
CATEGORIAS = (
    "Fato Relevante",
    "Comunicado ao Mercado",
    "Aviso aos Cotistas",
    "Aviso aos Cotistas - Estruturado",
    "Relatórios",
    "Oferta Pública de Distribuição de Cotas",
    "Assembleia",
)
TIPOS_DE_EVENTO = ("data_com", "pagamento", "subscricao", "assembleia", "outro")
MESES = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)  # fmt: skip
TRECHO_POR_DOCUMENTO = 2500
DOCUMENTOS_NO_RESUMO = 8


@dataclass(frozen=True, slots=True)
class Documento:
    id: int
    categoria: str
    tipo: str
    especie: str
    referencia: date | None
    entregue_em: datetime
    texto: str = ""

    @property
    def titulo(self) -> str:
        base = self.tipo.strip() or self.categoria.strip()
        especie = self.especie.strip()
        return f"{base} · {especie}" if especie and especie.lower() != base.lower() else base


@dataclass(frozen=True, slots=True)
class Evento:
    tipo: str
    data: date
    texto: str
    documento: int


@dataclass(frozen=True, slots=True)
class Insight:
    resumo: str
    preparar: list[str] = field(default_factory=list)
    eventos: list[Evento] = field(default_factory=list)


def relevante(doc: Documento) -> bool:
    return doc.categoria.strip() in CATEGORIAS


def para_resumir(docs: list[Documento], hoje: date, dias: int = 90) -> list[Documento]:
    """Os documentos relevantes mais novos, dentro da janela, do mais novo ao mais velho."""
    janela = [d for d in docs if relevante(d) and (hoje - d.entregue_em.date()).days <= dias]
    return sorted(janela, key=lambda d: d.entregue_em, reverse=True)[:DOCUMENTOS_NO_RESUMO]


SISTEMA = (
    "Você resume documentos oficiais de fundos imobiliários (FII) para um cotista pessoa "
    "física, em português do Brasil. Use só o que está escrito nos documentos: não invente "
    "números, datas nem fatos, e não recomende comprar nem vender. Responda só com JSON, sem "
    'texto fora dele, no formato {"resumo": "até 3 frases com o que mudou", "preparar": '
    '["ação concreta do cotista, com a data se houver"], "eventos": [{"tipo": '
    '"data_com|pagamento|subscricao|assembleia|outro", "data": "AAAA-MM-DD", "texto": '
    '"curto", "documento": 123}]}. "preparar" tem no máximo 3 itens e fica vazio se nada '
    "pede ação (por exemplo: direito de preferência numa emissão, data-com de rendimento, "
    "assembleia para votar). Um evento só entra se a data estiver escrita no documento citado."
)


def mensagens(ticker: str, docs: list[Documento], hoje: date) -> list[dict[str, str]]:
    partes = [f"Fundo {ticker}. Hoje é {hoje:%d/%m/%Y}."]
    for d in docs:
        trecho = d.texto[:TRECHO_POR_DOCUMENTO] or "(sem texto disponível)"
        partes.append(
            f"### Documento {d.id} · {d.titulo} · entregue em {d.entregue_em:%d/%m/%Y}\n{trecho}"
        )
    return [
        {"role": "system", "content": SISTEMA},
        {"role": "user", "content": "\n\n".join(partes)},
    ]


def _formas(d: date) -> tuple[str, ...]:
    mes = MESES[d.month - 1]
    return (
        f"{d:%d/%m/%Y}",
        f"{d:%d/%m/%y}",
        f"{d:%Y-%m-%d}",
        f"{d:%d.%m.%Y}",
        f"{d:%d-%m-%Y}",
        f"{d.day} de {mes} de {d.year}",
        f"{d.day}º de {mes} de {d.year}",
        f"{d:%d} de {mes} de {d.year}",
    )


def data_escrita_no_texto(d: date, texto: str) -> bool:
    baixo = re.sub(r"\s+", " ", texto.lower())
    return any(forma in baixo for forma in _formas(d))


def _json_da_resposta(texto: str) -> dict[str, object] | None:
    inicio, fim = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fim <= inicio:
        return None
    try:
        dados = json.loads(texto[inicio : fim + 1])
    except ValueError:
        return None
    return dados if isinstance(dados, dict) else None


def _curto(valor: object, limite: int) -> str:
    return re.sub(r"\s+", " ", valor).strip()[:limite] if isinstance(valor, str) else ""


def ler_resposta(resposta: str | dict[str, object], docs: list[Documento]) -> Insight | None:
    """Valida o JSON da IA. None se não der para confiar no resumo."""
    dados = resposta if isinstance(resposta, dict) else _json_da_resposta(resposta)
    if dados is None:
        return None
    resumo = _curto(dados.get("resumo"), 600)
    if not resumo:
        return None
    brutos = dados.get("preparar")
    preparar = [
        p for p in (_curto(x, 240) for x in (brutos if isinstance(brutos, list) else [])) if p
    ][:3]
    por_id = {d.id: d for d in docs}
    eventos: list[Evento] = []
    lista = dados.get("eventos")
    for e in lista if isinstance(lista, list) else []:
        if not isinstance(e, dict):
            continue
        try:
            quando = date.fromisoformat(str(e.get("data", "")))
            doc = por_id[int(str(e.get("documento", "")))]
        except (ValueError, KeyError):
            continue
        tipo = str(e.get("tipo", "outro"))
        texto = _curto(e.get("texto"), 140)
        if tipo in TIPOS_DE_EVENTO and texto and data_escrita_no_texto(quando, doc.texto):
            eventos.append(Evento(tipo, quando, texto, doc.id))
    eventos.sort(key=lambda x: x.data)
    return Insight(resumo, preparar, eventos[:6])


def insight_para_banco(insight: Insight) -> tuple[str, str, str]:
    """(summary, prepare, events) prontos para o INSERT, com jsonb em texto."""
    eventos = [
        {"tipo": e.tipo, "data": e.data.isoformat(), "texto": e.texto, "documento": e.documento}
        for e in insight.eventos
    ]
    return (
        insight.resumo,
        json.dumps(insight.preparar, ensure_ascii=False),
        json.dumps(eventos, ensure_ascii=False),
    )
