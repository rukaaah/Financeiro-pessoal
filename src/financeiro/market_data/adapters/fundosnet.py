"""Documentos que os FIIs publicam no Fundos.NET da B3 (consulta pública, sem login).

Busca: ``pesquisarGerenciadorDocumentosDados`` devolve JSON com ``data`` (lista de
documentos, campos ``id``, ``categoriaDocumento``, ``tipoDocumento``, ``especieDocumento``,
``dataReferencia`` e ``dataEntrega`` como "dd/mm/aaaa hh:mm"). Download:
``downloadDocumento?id=`` devolve o arquivo, às vezes em base64; pode ser PDF, HTML ou o
XML dos documentos estruturados. Sem rede aqui: o job baixa, este módulo só lê.
"""

import base64
import binascii
import contextlib
import io
import json
import re
from datetime import date, datetime
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

from financeiro.market_data.domain.insights import Documento

BASE = "https://fnet.bmfbovespa.com.br/fnet/publico"
BUSCA = (
    BASE + "/pesquisarGerenciadorDocumentosDados?d=0&s=0&l={quantos}"
    "&o%5B0%5D%5BdataEntrega%5D=desc&cnpjFundo={cnpj}"
)
DOWNLOAD = BASE + "/downloadDocumento?id={id}"
EXIBIR = BASE + "/exibirDocumento?id={id}"
LIMITE_DE_TEXTO = 8000
SP = ZoneInfo("America/Sao_Paulo")


def _data(texto: object) -> date | None:
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", str(texto or "").strip())
    return date(int(m[3]), int(m[2]), int(m[1])) if m else None


def _entrega(texto: object) -> datetime | None:
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})(?: (\d{2}):(\d{2}))?", str(texto or "").strip())
    if not m:
        return None
    return datetime(int(m[3]), int(m[2]), int(m[1]), int(m[4] or 0), int(m[5] or 0), tzinfo=SP)


def ler_busca(corpo: bytes | str) -> list[Documento]:
    """Documentos da resposta de busca; itens sem id ou sem data de entrega são ignorados."""
    try:
        dados = json.loads(corpo)
        itens = dados["data"]
    except (ValueError, KeyError, TypeError):
        return []
    saida: list[Documento] = []
    for item in itens if isinstance(itens, list) else []:
        if not isinstance(item, dict):
            continue
        entregue = _entrega(item.get("dataEntrega"))
        ident = item.get("id")
        if entregue is None or not isinstance(ident, int) or isinstance(ident, bool):
            continue
        saida.append(
            Documento(
                id=ident,
                categoria=str(item.get("categoriaDocumento") or ""),
                tipo=str(item.get("tipoDocumento") or ""),
                especie=str(item.get("especieDocumento") or ""),
                referencia=_data(item.get("dataReferencia")),
                entregue_em=entregue,
            )
        )
    return saida


class _SoTexto(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.partes: list[str] = []
        self._pular = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._pular += 1
        elif tag in {"br", "p", "div", "tr", "li", "h1", "h2", "h3"}:
            self.partes.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._pular:
            self._pular -= 1
        elif tag in {"td", "th"}:
            self.partes.append(" ")

    def handle_data(self, data: str) -> None:
        if not self._pular:
            self.partes.append(data)


def _limpo(texto: str) -> str:
    linhas = (re.sub(r"[ \t\xa0]+", " ", ln).strip() for ln in texto.splitlines())
    return "\n".join(ln for ln in linhas if ln)[:LIMITE_DE_TEXTO]


def _decodificar(bruto: bytes) -> str:
    try:
        return bruto.decode("utf-8")
    except UnicodeDecodeError:
        return bruto.decode("latin-1")


def _pdf(bruto: bytes) -> str:
    from pypdf import PdfReader  # só o job instala (grupo "jobs" do pyproject)

    try:
        leitor = PdfReader(io.BytesIO(bruto))
        return "\n".join((p.extract_text() or "") for p in leitor.pages[:6])
    except Exception:  # PDF corrompido não pode derrubar o job
        return ""


def texto_do_documento(corpo: bytes) -> str:
    """Texto legível do arquivo baixado, com no máximo ``LIMITE_DE_TEXTO`` caracteres."""
    bruto = corpo.strip().strip(b'"')
    if not bruto.startswith((b"%PDF", b"<")):
        with contextlib.suppress(binascii.Error, ValueError):
            bruto = base64.b64decode(re.sub(rb"\s+", b"", bruto), validate=True).strip()
    if bruto.startswith(b"%PDF"):
        return _limpo(_pdf(bruto))
    texto = _decodificar(bruto)
    if texto.lstrip().startswith("<?xml"):
        # XML estruturado (ex.: aviso de rendimentos): "Campo: valor", uma linha por folha.
        pares = re.findall(r"<([A-Za-z][\w.-]*)>([^<>]+)</\1>", texto)
        return _limpo("\n".join(f"{campo}: {valor.strip()}" for campo, valor in pares))
    if "<" in texto and ">" in texto:
        leitor = _SoTexto()
        leitor.feed(texto)
        return _limpo("".join(leitor.partes))
    return _limpo(texto)
