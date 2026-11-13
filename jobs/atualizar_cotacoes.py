"""Job de cotações e indicadores dos FIIs em carteira (RF10, ADR-020).

Dois modos, chamados pelo `.github/workflows/cotacoes.yml`:

- ``intradia``: de hora em hora no pregão, o preço pela brapi (plano gratuito, exige
  o secret ``BRAPI_TOKEN``; sem ele o modo só avisa e sai). P/VP e DY são refeitos com
  o preço novo e o último informe da CVM guardado no banco.
- ``fechamento``: uma vez por dia útil, depois que a B3 publica o arquivo do dia.
  Grava o fechamento e o volume financeiro (liquidez) pela B3, completa os pregões
  que faltam nos últimos 31 dias e atualiza os informes mensais da CVM.

Só os tickers em carteira de alguém (``tickers_em_carteira()``). A tela lê do banco,
nunca da web. Falha de uma fonte não apaga o último dado bom.

Uso:
    export DATABASE_URL=...   # papel com escrita em asset_quotes e fii_reports
    uv run python jobs/atualizar_cotacoes.py fechamento
"""

import io
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import replace
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import psycopg

from financeiro.market_data.adapters.brapi import ler_preco
from financeiro.market_data.adapters.cotahist import Fechamento, ler_cotahist
from financeiro.market_data.adapters.cvm_informe_mensal import (
    PerfilDoFundo,
    extras_por_cnpj,
    informes_por_cnpj,
    isin_para_cnpj,
    perfis_por_cnpj,
)
from financeiro.market_data.domain.indicadores import InformeMensal, dy_12m_percentual, pvp

AGENTE = "financeiro-pessoal-job (projeto pessoal)"
SP = ZoneInfo("America/Sao_Paulo")
B3 = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{dia}.ZIP"
CVM = "https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_{ano}.zip"
BRAPI = "https://brapi.dev/api/quote/{ticker}"
DIAS_DE_HISTORICO = 31

UPSERT = (
    "INSERT INTO asset_quotes (ticker, quoted_on, price, pvp, dy_12m, liquidity, source)"
    " VALUES (%s, %s, %s, %s, %s, %s, %s)"
    " ON CONFLICT (ticker, quoted_on) DO UPDATE SET price = excluded.price,"
    " pvp = coalesce(excluded.pvp, asset_quotes.pvp),"
    " dy_12m = coalesce(excluded.dy_12m, asset_quotes.dy_12m),"
    " liquidity = coalesce(excluded.liquidity, asset_quotes.liquidity),"
    " source = excluded.source, fetched_at = now()"
)
# O intradia não passa por cima do fechamento oficial do dia.
UPSERT_INTRADIA = UPSERT + " WHERE asset_quotes.source <> 'b3'"


def baixar(url: str, cabecalhos: dict[str, str] | None = None) -> bytes | None:
    """Corpo da resposta, ou None em 404 (dia sem pregão ou arquivo ainda não publicado)."""
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, **(cabecalhos or {})})
    try:
        with urllib.request.urlopen(pedido, timeout=60) as resposta:
            corpo: bytes = resposta.read()
            return corpo
    except urllib.error.HTTPError as erro:
        if erro.code == 404:
            return None
        raise


def arquivos_do_zip(conteudo: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        return {nome: z.read(nome).decode("latin-1") for nome in z.namelist()}


def informes_do_banco(cur: psycopg.Cursor[tuple[object, ...]]) -> dict[str, list[InformeMensal]]:
    cur.execute("SELECT ticker, ref_month, nav_per_share, dy_month FROM fii_reports")
    saida: dict[str, list[InformeMensal]] = {}
    for ticker, ref, vp, dy in cur.fetchall():
        assert isinstance(ref, date) and isinstance(vp, Decimal) and isinstance(dy, Decimal)
        saida.setdefault(str(ticker), []).append(InformeMensal(ref, vp, dy))
    return saida


def indicadores(
    preco: Decimal, informes: list[InformeMensal], ate: date
) -> tuple[Decimal | None, Decimal | None]:
    validos = [i for i in informes if i.referencia < ate.replace(day=1)]
    return pvp(preco, validos), dy_12m_percentual(preco, validos)


def gravar_historico(
    cur: psycopg.Cursor[tuple[object, ...]],
    cnpj_de: dict[str, str],
    gerais: list[str],
    complementos: list[str],
) -> None:
    """Perfil do fundo e, por mês, cotas emitidas, cotistas e PL (histórico de funcionamento)."""
    cnpjs = set(cnpj_de.values())
    perfis: dict[str, PerfilDoFundo] = {}
    for geral in gerais:  # do ano anterior para o atual: o perfil mais novo vence
        for cnpj, novo in perfis_por_cnpj(geral, cnpjs).items():
            antigo = perfis.get(cnpj)
            juntas = {**(antigo.cotas_por_mes if antigo else {}), **novo.cotas_por_mes}
            perfis[cnpj] = replace(novo, cotas_por_mes=juntas)
    extras: dict[tuple[str, date], tuple[int | None, Decimal | None]] = {}
    for complemento in complementos:
        extras.update(extras_por_cnpj(complemento, cnpjs))
    for ticker, cnpj in cnpj_de.items():
        perfil = perfis.get(cnpj)
        if perfil is not None:
            cur.execute(
                "INSERT INTO fii_profiles"
                " (ticker, cnpj, name, started_on, segment, mandate, management)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (ticker) DO UPDATE"
                " SET cnpj = excluded.cnpj, name = excluded.name, started_on = excluded.started_on,"
                " segment = excluded.segment, mandate = excluded.mandate,"
                " management = excluded.management, fetched_at = now()",
                (
                    ticker,
                    cnpj,
                    perfil.nome,
                    perfil.inicio,
                    perfil.segmento,
                    perfil.mandato,
                    perfil.gestao,
                ),
            )
        meses = set(perfil.cotas_por_mes if perfil else {}) | {
            ref for c, ref in extras if c == cnpj
        }
        for ref in meses:
            cotistas, pl = extras.get((cnpj, ref), (None, None))
            emitidas = perfil.cotas_por_mes.get(ref) if perfil else None
            cur.execute(
                "UPDATE fii_reports SET shares_outstanding = %s, shareholders = %s, net_assets = %s"
                " WHERE ticker = %s AND ref_month = %s",
                (emitidas, cotistas, pl, ticker, ref),
            )


def tickers(cur: psycopg.Cursor[tuple[object, ...]]) -> list[str]:
    cur.execute("SELECT * FROM tickers_em_carteira()")
    return [str(linha[0]) for linha in cur.fetchall()]


def intradia(conexao: psycopg.Connection[tuple[object, ...]]) -> int:
    token = os.environ.get("BRAPI_TOKEN", "").strip()
    if not token:
        print("BRAPI_TOKEN não cadastrado: cotação intradia pulada (o fechamento segue).")
        return 0
    hoje = datetime.now(SP).date()
    with conexao.cursor() as cur:
        lista = tickers(cur)
        informes = informes_do_banco(cur)
        falhas = 0
        for indice, ticker in enumerate(lista):
            if indice:
                time.sleep(1.0)  # plano gratuito: uma requisição por vez
            try:
                corpo = baixar(BRAPI.format(ticker=ticker), {"Authorization": f"Bearer {token}"})
            except OSError as erro:
                print(f"{ticker}: brapi falhou ({erro.__class__.__name__})", file=sys.stderr)
                falhas += 1
                continue
            preco = ler_preco(corpo.decode("utf-8", errors="replace")) if corpo else None
            if preco is None:
                print(f"{ticker}: brapi sem preço; nada gravado", file=sys.stderr)
                falhas += 1
                continue
            p, dy = indicadores(preco, informes.get(ticker, []), hoje)
            cur.execute(UPSERT_INTRADIA, (ticker, hoje, preco, p, dy, None, "brapi"))
            conexao.commit()
            print(f"{ticker}: R$ {preco} (intradia)")
    print(f"{len(lista) - falhas} de {len(lista)} tickers atualizados (intradia).")
    return 1 if lista and falhas == len(lista) else 0


def fechamento(conexao: psycopg.Connection[tuple[object, ...]]) -> int:
    hoje = datetime.now(SP).date()
    with conexao.cursor() as cur:
        lista = tickers(cur)
        if not lista:
            print("Nenhum ticker em carteira.")
            return 0
        cur.execute(
            "SELECT quoted_on, count(*) FROM asset_quotes"
            " WHERE source = 'b3' AND ticker = ANY(%s) AND quoted_on >= %s GROUP BY 1",
            (lista, hoje - timedelta(days=DIAS_DE_HISTORICO)),
        )
        completos = {d for d, n in cur.fetchall() if int(str(n)) >= len(lista)}

        # 1. Pregões da B3: hoje sempre (traz o ISIN), e os dias úteis que faltam.
        fechamentos: dict[date, dict[str, Fechamento]] = {}
        for atras in range(DIAS_DE_HISTORICO + 1):
            dia = hoje - timedelta(days=atras)
            if dia.weekday() >= 5 or (atras and dia in completos):
                continue
            conteudo = baixar(B3.format(dia=dia.strftime("%d%m%Y")))
            if conteudo is None:
                continue
            texto = "\n".join(arquivos_do_zip(conteudo).values())
            lidos = ler_cotahist(texto, set(lista))
            if lidos:
                fechamentos[dia] = lidos
        if not fechamentos:
            print("B3 sem arquivo novo (feriado ou ainda não publicado).")

        # 2. Informes da CVM deste ano e do anterior: VP da cota e DY do mês.
        isins = {f.ticker: f.isin for dia in sorted(fechamentos) for f in fechamentos[dia].values()}
        cur.execute("SELECT DISTINCT ON (ticker) ticker, cnpj FROM fii_reports ORDER BY ticker")
        cnpj_de = {str(t): str(c) for t, c in cur.fetchall()}
        gerais: list[str] = []
        complementos: list[str] = []
        for ano in (hoje.year - 1, hoje.year):
            try:
                conteudo = baixar(CVM.format(ano=ano))
            except OSError as erro:
                print(f"CVM {ano}: falhou ({erro.__class__.__name__})", file=sys.stderr)
                continue
            if conteudo is None:
                continue
            for nome, texto in arquivos_do_zip(conteudo).items():
                if "_geral_" in nome:
                    gerais.append(texto)
                elif "_complemento_" in nome:
                    complementos.append(texto)
        for geral in gerais:  # do ano anterior para o atual: o mais recente vence
            por_isin = isin_para_cnpj(geral)
            cnpj_de.update({t: por_isin[i] for t, i in isins.items() if i in por_isin})
        for complemento in complementos:
            por_cnpj = informes_por_cnpj(complemento, set(cnpj_de.values()))
            for ticker, cnpj in cnpj_de.items():
                for inf in por_cnpj.get(cnpj, []):
                    cur.execute(
                        "INSERT INTO fii_reports (ticker, ref_month, cnpj, nav_per_share, dy_month)"
                        " VALUES (%s, %s, %s, %s, %s) ON CONFLICT (ticker, ref_month) DO UPDATE"
                        " SET cnpj = excluded.cnpj, nav_per_share = excluded.nav_per_share,"
                        " dy_month = excluded.dy_month, fetched_at = now()",
                        (ticker, inf.referencia, cnpj, inf.vp_cota, inf.dy_mes),
                    )
        gravar_historico(cur, cnpj_de, gerais, complementos)
        conexao.commit()

        # 3. Grava os fechamentos com P/VP e DY calculados.
        informes = informes_do_banco(cur)
        for dia in sorted(fechamentos):
            for f in fechamentos[dia].values():
                p, dy = indicadores(f.preco, informes.get(f.ticker, []), dia)
                cur.execute(UPSERT, (f.ticker, dia, f.preco, p, dy, f.volume, "b3"))
        conexao.commit()
        ultimo = max(fechamentos) if fechamentos else None
        if ultimo:
            for f in fechamentos[ultimo].values():
                print(f"{f.ticker}: R$ {f.preco} em {ultimo:%d/%m} (B3)")
        sem_preco = sorted(set(lista) - {t for lido in fechamentos.values() for t in lido})
        if sem_preco and fechamentos:
            print(f"Sem fechamento na B3: {', '.join(sem_preco)}", file=sys.stderr)
    return 0


def main() -> int:
    modo = sys.argv[1] if len(sys.argv) > 1 else "fechamento"
    if modo not in {"intradia", "fechamento"}:
        print("Uso: atualizar_cotacoes.py intradia|fechamento", file=sys.stderr)
        return 2
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL não definida.", file=sys.stderr)
        return 2
    url = url.replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url) as conexao:
        return intradia(conexao) if modo == "intradia" else fechamento(conexao)


if __name__ == "__main__":
    raise SystemExit(main())
