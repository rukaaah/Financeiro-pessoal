"""Job diário de notícias e insights dos FIIs em carteira (ADR-021).

Para cada ticker em carteira de alguém (``tickers_em_carteira()``) com CNPJ conhecido
pelo informe da CVM (``fii_reports``):

1. busca os documentos que o fundo publicou no Fundos.NET da B3 e guarda os novos
   (fato relevante, comunicado, aviso aos cotistas, relatório, oferta, assembleia), com
   o texto extraído;
2. se chegou documento novo, pede à Workers AI um resumo, o que o cotista precisa fazer
   e as datas (data-com, pagamento, subscrição, assembleia). Data que não está escrita no
   documento citado é descartada. Sem os secrets da Cloudflare, só guarda os documentos;
3. se chegou relatório gerencial novo, pede à IA o comportamento da gestão: o que ela
   pretende fazer e onde mudou de ideia entre os relatórios. Plano ou mudança sem trecho
   copiado do documento citado é descartado.

Falha de um fundo não derruba os outros nem apaga o último resumo bom.

Uso:
    export DATABASE_URL=...   # papel com escrita em fii_documents e fii_insights
    export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=...   # opcionais
    uv run --group jobs python jobs/pesquisar_fiis.py
"""

import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg

from financeiro.market_data.adapters.fundosnet import BUSCA, DOWNLOAD, ler_busca, texto_do_documento
from financeiro.market_data.adapters.workers_ai import MODELO, gerar
from financeiro.market_data.domain.insights import (
    Documento,
    gestao_para_banco,
    insight_para_banco,
    ler_gestao,
    ler_resposta,
    mensagens,
    mensagens_da_gestao,
    para_resumir,
    relatorios_da_gestao,
    relevante,
)

AGENTE = "financeiro-pessoal-job (projeto pessoal)"
SP = ZoneInfo("America/Sao_Paulo")
NOVOS_POR_FUNDO = 12
PAUSA = 0.5  # segundos entre pedidos ao Fundos.NET

Cursor = psycopg.Cursor[tuple[object, ...]]


def baixar(url: str) -> bytes:
    pedido = urllib.request.Request(
        url, headers={"User-Agent": AGENTE, "X-Requested-With": "XMLHttpRequest"}
    )
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        corpo: bytes = resposta.read()
        return corpo


def fundos(cur: Cursor) -> list[tuple[str, str]]:
    cur.execute(
        "SELECT t.ticker, r.cnpj FROM tickers_em_carteira() AS t(ticker)"
        " JOIN LATERAL (SELECT cnpj FROM fii_reports f WHERE f.ticker = t.ticker"
        " ORDER BY ref_month DESC LIMIT 1) r ON true ORDER BY 1"
    )
    return [(str(t), str(c)) for t, c in cur.fetchall()]


def guardar_novos(cur: Cursor, ticker: str, cnpj: str) -> int:
    lista = [d for d in ler_busca(baixar(BUSCA.format(quantos=40, cnpj=cnpj))) if relevante(d)]
    cur.execute("SELECT id FROM fii_documents WHERE ticker = %s", (ticker,))
    ja = {int(str(i)) for (i,) in cur.fetchall()}
    novos = [d for d in lista if d.id not in ja][:NOVOS_POR_FUNDO]
    for d in novos:
        time.sleep(PAUSA)
        try:
            texto = texto_do_documento(baixar(DOWNLOAD.format(id=d.id)))
        except (urllib.error.URLError, TimeoutError) as erro:
            print(f"{ticker}: documento {d.id} sem texto ({erro})", file=sys.stderr)
            texto = ""
        cur.execute(
            "INSERT INTO fii_documents"
            " (ticker, id, category, title, ref_date, delivered_at, content)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (
                ticker,
                d.id,
                d.categoria,
                d.titulo,
                d.referencia,
                d.entregue_em,
                texto.replace("\x00", ""),
            ),
        )
    return len(novos)


def documentos_do_banco(cur: Cursor, ticker: str) -> list[Documento]:
    cur.execute(
        "SELECT id, category, title, ref_date, delivered_at, content FROM fii_documents"
        " WHERE ticker = %s ORDER BY delivered_at DESC LIMIT 40",
        (ticker,),
    )
    saida = []
    for ident, cat, titulo, ref, entregue, texto in cur.fetchall():
        assert isinstance(entregue, datetime)
        saida.append(
            Documento(
                int(str(ident)),
                str(cat),
                str(titulo),
                "",
                ref if isinstance(ref, date) else None,
                entregue,
                str(texto),
            )
        )
    return saida


def resumir(cur: Cursor, ticker: str, conta: str | None, token: str | None) -> str:
    hoje = datetime.now(SP).date()
    docs = para_resumir(documentos_do_banco(cur, ticker), hoje)
    ids = sorted(d.id for d in docs)
    cur.execute("SELECT documents FROM fii_insights WHERE ticker = %s", (ticker,))
    atual = cur.fetchone()
    if atual and isinstance(atual[0], list) and sorted(atual[0]) == ids:
        return "sem novidade"
    if not docs:
        cur.execute("DELETE FROM fii_insights WHERE ticker = %s", (ticker,))
        return "sem documentos recentes"
    if not (conta and token):
        return "sem IA (faltam os secrets da Cloudflare)"
    resposta = gerar(mensagens(ticker, docs, hoje), conta, token, AGENTE)
    insight = ler_resposta(resposta, docs) if resposta is not None else None
    if insight is None:
        return "resposta da IA descartada"
    resumo, preparar, eventos = insight_para_banco(insight)
    cur.execute(
        "INSERT INTO fii_insights (ticker, summary, prepare, events, documents, model)"
        " VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)"
        " ON CONFLICT (ticker) DO UPDATE SET summary = excluded.summary,"
        " prepare = excluded.prepare,"
        " events = excluded.events, documents = excluded.documents, model = excluded.model,"
        " generated_at = now()",
        (ticker, resumo, preparar, eventos, ids, MODELO),
    )
    return f"resumo novo com {len(ids)} documentos"


def ler_a_gestao(cur: Cursor, ticker: str, conta: str | None, token: str | None) -> str:
    hoje = datetime.now(SP).date()
    docs = relatorios_da_gestao(documentos_do_banco(cur, ticker))
    ids = sorted(d.id for d in docs)
    cur.execute("SELECT documents FROM fii_management WHERE ticker = %s", (ticker,))
    atual = cur.fetchone()
    if atual and isinstance(atual[0], list) and sorted(atual[0]) == ids:
        return "gestão sem novidade"
    if len(docs) < 2:
        return "gestão: menos de 2 relatórios para comparar"
    if not (conta and token):
        return "gestão sem IA"
    resposta = gerar(mensagens_da_gestao(ticker, docs, hoje), conta, token, AGENTE)
    gestao = ler_gestao(resposta, docs) if resposta is not None else None
    if gestao is None:
        return "gestão: resposta da IA descartada"
    cur.execute(
        "INSERT INTO fii_management (ticker, management, documents, model)"
        " VALUES (%s, %s::jsonb, %s, %s)"
        " ON CONFLICT (ticker) DO UPDATE SET management = excluded.management,"
        " documents = excluded.documents, model = excluded.model, generated_at = now()",
        (ticker, gestao_para_banco(gestao), ids, MODELO),
    )
    return f"gestão nova com {len(ids)} relatórios"


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2
    conta, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    falhas = 0
    with psycopg.connect(
        url.replace("postgresql+psycopg://", "postgresql://"), autocommit=True
    ) as conexao:
        with conexao.cursor() as cur:
            lista = fundos(cur)
        for ticker, cnpj in lista:
            try:
                with conexao.transaction(), conexao.cursor() as cur:
                    novos = guardar_novos(cur, ticker, cnpj)
                    situacao = resumir(cur, ticker, conta, token)
                    gestao = ler_a_gestao(cur, ticker, conta, token)
                print(f"{ticker}: {novos} documentos novos, {situacao}, {gestao}")
            except (urllib.error.URLError, TimeoutError, psycopg.Error) as erro:
                falhas += 1
                print(f"{ticker}: falhou ({erro})", file=sys.stderr)
            time.sleep(PAUSA)
        with conexao.cursor() as cur:
            cur.execute("DELETE FROM fii_documents WHERE delivered_at < now() - interval '1 year'")
    print(f"{len(lista)} fundos, {falhas} com falha.")
    return 1 if lista and falhas == len(lista) else 0


if __name__ == "__main__":
    raise SystemExit(main())
