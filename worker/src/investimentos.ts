import { type AtivoNaCarteira, type Classe, cotasSugeridas, deDecimal6, deDigitado, emissoesDe, NOME_DA_CLASSE, ondeAportar, type OperacaoDatada, paraNumeric, posicaoDe, proventosEstimados, relatorioDaCarteira, type RendimentoDoMes, rendimentoSobreCusto, valorDe } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const TICKER_FII = /^[A-Z]{4}\d{2}$/;
const CLASSES = Object.keys(NOME_DA_CLASSE) as Classe[];
type Corpo = Record<string, unknown>;

const SQL_ATIVOS = `
  select a.id, a.ticker, a.name as nome, a.class as classe,
         coalesce(json_agg(json_build_object('quantidade', t.quantity::text, 'preco', t.unit_price::text, 'data', t.traded_on::text) order by t.traded_on, t.created_at)
                  filter (where t.id is not null), '[]') as operacoes,
         q.price::text as preco, q.pvp::float as pvp, q.dy_12m::float as dy, q.quoted_on::text as cotado_em,
         q.source as fonte, to_char(q.fetched_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') as atualizado_em,
         liq.media::float as liquidez,
         q0.price::text as preco_mes_passado, q1.price::float as preco_anterior, q30.price::float as preco_30d,
         vp.nav_per_share::float as vp_cota, to_char(vp.ref_month, 'YYYY-MM') as vp_mes,
         (select coalesce(json_agg(json_build_object('mes', to_char(r.ref_month, 'YYYY-MM'), 'porCota', (r.dy_month * p.nav_per_share)::numeric(14,6)::text) order by r.ref_month), '[]')
            from fii_reports r join fii_reports p on p.ticker = r.ticker and p.ref_month = (r.ref_month - interval '1 month')::date
           where r.ticker = a.ticker) as rendimentos
    from assets a
    left join asset_trades t on t.asset_id = a.id
    left join lateral (select * from asset_quotes x where x.ticker = a.ticker order by quoted_on desc limit 1) q on true
    left join lateral (select * from asset_quotes x where x.ticker = a.ticker and x.quoted_on < date_trunc('month', current_date) order by quoted_on desc limit 1) q0 on true
    left join lateral (select price from asset_quotes x where x.ticker = a.ticker and x.quoted_on < q.quoted_on order by quoted_on desc limit 1) q1 on true
    left join lateral (select price from asset_quotes x where x.ticker = a.ticker and x.quoted_on <= q.quoted_on - 30 order by quoted_on desc limit 1) q30 on true
    left join lateral (select avg(liquidity) as media from (select liquidity from asset_quotes x where x.ticker = a.ticker and x.liquidity is not null order by quoted_on desc limit 21) u) liq on true
    left join lateral (select nav_per_share, ref_month from fii_reports r where r.ticker = a.ticker order by ref_month desc limit 1) vp on true
   group by a.id, q.price, q.pvp, q.dy_12m, q.quoted_on, q.source, q.fetched_at, liq.media, q0.price, q1.price, q30.price, vp.nav_per_share, vp.ref_month
   order by a.class, a.ticker`;

/** Notícias dos FIIs da carteira (ADR-021): resumo da IA e os documentos oficiais mais novos. */
const SQL_NOTICIAS = `
  select a.ticker, i.summary as resumo, coalesce(i.prepare, '[]') as preparar, coalesce(i.events, '[]') as eventos,
         to_char(i.generated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') as gerado_em,
         coalesce((select json_agg(json_build_object('id', d.id, 'titulo', d.title, 'categoria', d.category,
                                                     'entregue_em', to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) order by d.delivered_at desc)
                     from (select * from fii_documents x where x.ticker = a.ticker order by x.delivered_at desc limit 6) d), '[]') as documentos,
         m.management as gestao,
         (select json_object_agg(d.id, to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
            from fii_documents d where d.ticker = a.ticker and d.id = any(m.documents)) as gestao_datas
    from assets a
    left join fii_insights i on i.ticker = a.ticker
    left join fii_management m on m.ticker = a.ticker
   where a.class <> 'treasury'
   order by a.ticker`;

/** Aportes e proventos por mês, nas contas de investimento, 12 meses. */
const SQL_SERIES = `
  with meses as (select generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month')::date as mm)
  select to_char(mm, 'YYYY-MM') as mes,
         coalesce((select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
                    where a.kind = 'investment' and t.kind = 'transfer' and t.amount > 0 and date_trunc('month', t.occurred_on) = mm), 0)::numeric(14,2)::text as aporte,
         coalesce((select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
                    where a.kind = 'investment' and t.kind = 'income' and date_trunc('month', t.occurred_on) = mm), 0)::numeric(14,2)::text as proventos,
         coalesce((select sum(t.amount) from transactions t join accounts a on a.id = t.account_id
                    where a.kind = 'investment' and t.kind = 'transfer' and t.amount > 0 and t.occurred_on < (mm + interval '1 month')), 0)::numeric(14,2)::text as aportado_acumulado
    from meses order by mm`;

const SQL_REGRAS = `
  select coalesce(r.max_pvp, 1)::float as max_pvp, coalesce(r.max_weight, 20)::float as max_peso, coalesce(r.min_liquidity, 500000)::float as min_liquidez,
         coalesce((select json_object_agg(t.class, t.percent::float) from allocation_targets t), '{}') as metas
    from (select 1) x left join investment_rules r on true`;

/** Momento de compra (ADR-022): o último veredito do medidor para cada FII da carteira. */
const SQL_MOMENTO = `
  select a.ticker, o.day::text as dia, o.price::text as preco, o.score as nota, o.percentile as percentil, o.trading_days as pregoes,
         o.verdict as veredito, o.reason as motivo, o.risks as riscos, o.outlook as previsao, o.target_price::text as preco_alvo,
         o.facts as fatos, o.model is not null as com_ia,
         to_char(o.generated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') as gerado_em
    from assets a
    join lateral (select * from fii_opportunities x where x.ticker = a.ticker order by day desc limit 1) o on true
   where a.class <> 'treasury'`;
const SQL_PANORAMA = `
  select day::text as dia, trend as tendencia, funds as fundos, above_average as acima_da_media, median_change_21::float as variacao_21,
         rising as subindo, falling as caindo, selic::text as selic, selic_direction as direcao_selic
    from fii_market_daily order by day desc limit 1`;
const ORDEM: Record<string, number> = { grande_dia: 0, bom_preco: 1, esperar: 2, sem_dados: 3 };

export function rotasDeInvestimentos<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/investimentos/noticias", async (c) => {
    const [linhas = []] = await rodar(c, [consulta(SQL_NOTICIAS)]);
    return c.json({ noticias: linhas });
  });

  app.get("/api/investimentos/momento", async (c) => {
    let aporte: bigint;
    try { aporte = deDigitado(c.req.query("aporte") ?? "500"); } catch { return c.json({ erro: "Valor do aporte em reais, como 500 ou 1.250,00." }, 400); }
    if (aporte <= 0n) return c.json({ erro: "O aporte precisa ser maior que zero." }, 400);
    const [linhas = [], panoramaL = [], ativosL = [], regrasL = []] = await rodar(c, [consulta(SQL_MOMENTO), consulta(SQL_PANORAMA), consulta(SQL_ATIVOS), consulta(SQL_REGRAS)]);
    const valores = new Map(ativosL.map((a) => [String(a.ticker), valorDe(posicaoDe(a.operacoes as { quantidade: string; preco: string }[]), a.preco ? String(a.preco) : null)]));
    const total = [...valores.values()].reduce((s, v) => s + v, 0n);
    const r = regrasL[0] ?? {};
    const regras = { maxPvp: Number(r.max_pvp ?? 1), maxPeso: Number(r.max_peso ?? 20) };
    const pvpDe = (f: Record<string, string>) => (f.pvp ? Number(f.pvp.replace(",", ".")) : null);
    const fundos = linhas.map((o) => {
      const fatos = (o.fatos ?? {}) as Record<string, string>;
      const comprar = o.veredito === "grande_dia" || o.veredito === "bom_preco";
      const s = comprar ? cotasSugeridas(String(o.preco), aporte, valores.get(String(o.ticker)) ?? 0n, total, regras, pvpDe(fatos)) : null;
      return {
        ticker: o.ticker, dia: o.dia, preco: Number(o.preco), nota: o.nota, percentil: o.percentil, pregoes: o.pregoes, veredito: o.veredito,
        motivo: o.motivo, riscos: o.riscos, previsao: o.previsao, preco_alvo: o.preco_alvo, fatos, com_ia: o.com_ia, gerado_em: o.gerado_em,
        sugestao: s ? { cotas: s.cotas, valor: paraNumeric(s.valor), limite: s.limite } : null,
      };
    }).sort((x, y) => (ORDEM[String(x.veredito)] ?? 9) - (ORDEM[String(y.veredito)] ?? 9) || Number(y.nota ?? -1) - Number(x.nota ?? -1));
    return c.json({ aporte: paraNumeric(aporte), panorama: panoramaL[0] ?? null, fundos });
  });

  app.get("/api/investimentos", async (c) => {
    let aporte: bigint;
    try { aporte = deDigitado(c.req.query("aporte") ?? "500"); } catch { return c.json({ erro: "Valor do aporte em reais, como 500 ou 1.250,00." }, 400); }
    if (aporte <= 0n) return c.json({ erro: "O aporte precisa ser maior que zero." }, 400);
    const [ativosL = [], series = [], regrasL = []] = await rodar(c, [consulta(SQL_ATIVOS), consulta(SQL_SERIES), consulta(SQL_REGRAS)]);
    const ativos = ativosL.map((a) => {
      const pos = posicaoDe(a.operacoes as { quantidade: string; preco: string }[]);
      const valor = valorDe(pos, a.preco ? String(a.preco) : null);
      const mesPassado = a.preco_mes_passado ? valorDe(pos, String(a.preco_mes_passado)) : null;
      const rend = (a.rendimentos ?? []) as RendimentoDoMes[];
      const proventos = proventosEstimados(a.operacoes as OperacaoDatada[], rend);
      return { a, pos, valor, mesPassado, proventos, proventosDesde: rend[0]?.mes ?? null };
    });
    const rendimentoDe = (xs: typeof ativos) => {
      const custo = xs.reduce((s, x) => s + x.pos.custo, 0n), valor = xs.reduce((s, x) => s + x.valor, 0n), prov = xs.reduce((s, x) => s + x.proventos, 0n);
      return { ...rendimentoSobreCusto(custo, valor, prov), proventos_valor: paraNumeric(prov) };
    };
    const total = ativos.reduce((s, x) => s + x.valor, 0n);
    const r = regrasL[0] ?? {};
    const regras = { maxPvp: Number(r.max_pvp ?? 1), maxPeso: Number(r.max_peso ?? 20), minLiquidez: Number(r.min_liquidez ?? 500000), metas: (r.metas ?? {}) as Partial<Record<Classe, number>> };
    const carteira: AtivoNaCarteira[] = ativos.map(({ a, valor }) => ({ ticker: String(a.ticker), classe: a.classe as Classe, valor, preco: a.preco ? String(a.preco) : null, pvp: a.pvp == null ? null : Number(a.pvp), liquidez: a.liquidez == null ? null : Number(a.liquidez) }));
    const sugestao = ondeAportar(carteira, regras, aporte);
    const relatorio = relatorioDaCarteira(ativos.map(({ a, valor }) => ({
      ticker: String(a.ticker), classe: a.classe as Classe, valor, preco: a.preco ? Number(a.preco) : null,
      precoAnterior: a.preco_anterior == null ? null : Number(a.preco_anterior), preco30d: a.preco_30d == null ? null : Number(a.preco_30d),
      pvp: a.pvp == null ? null : Number(a.pvp), dy: a.dy == null ? null : Number(a.dy), liquidez: a.liquidez == null ? null : Number(a.liquidez),
      cotadoEm: a.cotado_em ? String(a.cotado_em) : null,
    })), regras, hojeEmSaoPaulo());
    const ultima = ativos.map(({ a }) => a).filter((a) => a.atualizado_em).sort((x, y) => String(y.atualizado_em).localeCompare(String(x.atualizado_em)))[0];
    const n = paraNumeric;
    return c.json({
      total: n(total), custo: n(ativos.reduce((s, x) => s + x.pos.custo, 0n)),
      variacao_mes: n(ativos.reduce((s, x) => s + (x.mesPassado != null ? x.valor - x.mesPassado : 0n), 0n)),
      ativos: ativos.map((x) => { const { a, pos, valor, mesPassado } = x; return {
        id: a.id, ticker: a.ticker, nome: a.nome, classe: a.classe, classe_nome: NOME_DA_CLASSE[a.classe as Classe],
        quantidade: Number(pos.quantidade6) / 1e6, preco_medio: n(pos.precoMedio6 / 10000n),
        preco: a.preco ?? null, valor: n(valor), custo: n(pos.custo), peso: total > 0n ? Number((valor * 1000n) / total) / 10 : 0,
        variacao_pm: pos.custo > 0n ? Number(((valor - pos.custo) * 1000n) / pos.custo) / 10 : 0,
        variacao_mes: mesPassado != null && mesPassado > 0n ? Number(((valor - mesPassado) * 1000n) / mesPassado) / 10 : null,
        pvp: a.pvp, dy: a.dy, liquidez: a.liquidez, cotado_em: a.cotado_em, fonte: a.fonte ?? null, atualizado_em: a.atualizado_em ?? null,
        variacao_dia: a.preco && a.preco_anterior ? Math.round(((Number(a.preco) - Number(a.preco_anterior)) / Number(a.preco_anterior)) * 1000) / 10 : null,
        variacao_30d: a.preco && a.preco_30d ? Math.round(((Number(a.preco) - Number(a.preco_30d)) / Number(a.preco_30d)) * 1000) / 10 : null,
        vp_cota: a.vp_cota ?? null, vp_mes: a.vp_mes ?? null,
        rendimento: rendimentoDe([x]), proventos_desde: x.proventosDesde,
      }; }),
      rendimento: rendimentoDe(ativos),
      relatorio: { renda_mensal: n(relatorio.rendaMensal), alertas: relatorio.alertas, desatualizado: relatorio.desatualizado, atualizado_em: ultima?.atualizado_em ?? null, fonte: ultima?.fonte ?? null },
      classes: CLASSES.map((k) => {
        const v = ativos.filter((x) => x.a.classe === k).reduce((s, x) => s + x.valor, 0n);
        return { classe: k, nome: NOME_DA_CLASSE[k], valor: n(v), peso: total > 0n ? Number((v * 1000n) / total) / 10 : 0, meta: regras.metas[k] ?? null, rendimento: rendimentoDe(ativos.filter((x) => x.a.classe === k)) };
      }).filter((k) => k.valor !== "0.00" || k.meta != null),
      series, regras,
      onde_aportar: { aporte: n(aporte), sugestoes: sugestao.sugestoes.map((s) => ({ ...s, valor: n(s.valor) })), fora: sugestao.fora, sobra: n(sugestao.sobra), avisos: sugestao.avisos },
    });
  });

  /** Compra de ativo: a operação na carteira e a transferência da conta de origem (aporte é transferência). */
  app.post("/api/comprar-ativo", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    const ticker = String(b.ticker ?? "").trim().toUpperCase(), classe = String(b.classe ?? "");
    let qtd: bigint, preco: bigint;
    try { qtd = deDecimal6(String(b.quantidade ?? "").replace(",", ".")); preco = deDecimal6(String(b.preco ?? "").replace(/\./g, "").replace(",", ".")); } catch { return c.json({ erro: "Quantidade e preço em número, como 10 e 102,30." }, 400); }
    if (!/^[A-Z0-9 ]{3,30}$/.test(ticker) || !CLASSES.includes(classe as Classe) || qtd <= 0n || preco <= 0n || !UUID.test(String(b.conta_id)) || !UUID.test(String(b.investimento_id)))
      return c.json({ erro: "Preencha ativo, classe, quantidade, preço e as contas." }, 400);
    const valor = paraNumeric((qtd * preco * 2n / 10_000_000_000n + 1n) / 2n);
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data ?? "")) ? String(b.data) : hojeEmSaoPaulo();
    const transferencia = crypto.randomUUID();
    try {
      const resultados = await rodar(c, [
        consulta(
          `insert into assets (user_id, ticker, name, class, account_id)
           select current_app_user(), $1, $2, $3::asset_class, a.id from accounts a where a.id = $4 and a.kind = 'investment'
           on conflict (user_id, ticker) do update set name = assets.name returning id`,
          ticker, String(b.nome ?? ticker).slice(0, 80), classe, b.investimento_id),
        consulta(
          `insert into asset_trades (user_id, asset_id, traded_on, quantity, unit_price)
           select current_app_user(), id, $2::date, $3::numeric, $4::numeric from assets where ticker = $1 returning id`,
          ticker, data, String(b.quantidade).replace(",", "."), String(Number(preco) / 1e6)),
        consulta(
          `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id)
           select current_app_user(), 'transfer', a.id, -$2::numeric, $3::date, $4, $5::uuid from accounts a where a.id = $1 and a.kind in ('checking','cash','goal') returning id`,
          b.conta_id, valor, data, `Compra de ${ticker}`, transferencia),
        consulta(
          `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id)
           select current_app_user(), 'transfer', a.id, $2::numeric, $3::date, $4, $5::uuid from accounts a where a.id = $1 and a.kind = 'investment' returning id`,
          b.investimento_id, valor, data, `Compra de ${ticker}`, transferencia),
      ]);
      if (resultados.some((l) => l.length === 0)) return c.json({ erro: "Conta não encontrada." }, 400);
      return c.json({ valor }, 201);
    } catch (e) {
      if (/^(22|23)/.test((e as { code?: string })?.code ?? "")) return c.json({ erro: "Conta não encontrada." }, 400);
      throw e;
    }
  });

  /** Ficha de um fundo, na carteira ou não: perfil e histórico da CVM, indicadores e notícias. */
  app.get("/api/investimentos/fundo/:ticker", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    if (!TICKER_FII.test(ticker)) return c.json({ erro: "Código de fundo como MXRF11." }, 400);
    const [perfil = [], cot = [], hist = [], not = [], meu = []] = await rodar(c, [
      consulta(`select name as nome, cnpj, started_on::text as inicio, segment as segmento, mandate as mandato, management as gestao from fii_profiles where ticker = $1`, ticker),
      consulta(`select q.price::text as preco, q.pvp::float as pvp, q.dy_12m::float as dy, q.quoted_on::text as cotado_em, q.source as fonte,
                       (select avg(liquidity) from (select liquidity from asset_quotes x where x.ticker = $1 and x.liquidity is not null order by quoted_on desc limit 21) u)::float as liquidez
                  from asset_quotes q where q.ticker = $1 order by q.quoted_on desc limit 1`, ticker),
      consulta(`select to_char(r.ref_month, 'YYYY-MM') as mes, r.nav_per_share::float as vp_cota, (r.dy_month * 100)::float as dy_mes,
                       (r.dy_month * p.nav_per_share)::numeric(14,4)::float as por_cota, r.shares_outstanding::text as cotas,
                       r.shareholders as cotistas, r.net_assets::float as pl
                  from fii_reports r left join fii_reports p on p.ticker = r.ticker and p.ref_month = (r.ref_month - interval '1 month')::date
                 where r.ticker = $1 order by r.ref_month`, ticker),
      consulta(`select i.summary as resumo, coalesce(i.prepare, '[]') as preparar, coalesce(i.events, '[]') as eventos,
                       to_char(i.generated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') as gerado_em, $1::text as ticker,
                       coalesce((select json_agg(json_build_object('id', d.id, 'titulo', d.title, 'categoria', d.category,
                                  'entregue_em', to_char(d.delivered_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) order by d.delivered_at desc)
                                   from (select * from fii_documents x where x.ticker = $1 order by x.delivered_at desc limit 6) d), '[]') as documentos
                  from (select 1) z left join fii_insights i on i.ticker = $1`, ticker),
      consulta(`select exists(select 1 from assets where ticker = $1) as em_carteira, exists(select 1 from asset_watchlist where ticker = $1) as acompanhando`, ticker),
    ]);
    const h = hist.map((r) => ({ mes: String(r.mes), vp_cota: r.vp_cota as number, dy_mes: r.dy_mes as number, por_cota: r.por_cota as number | null, cotas: r.cotas == null ? null : Number(r.cotas), cotistas: r.cotistas as number | null, pl: r.pl as number | null }));
    const ult12 = h.slice(-12).map((r) => r.por_cota).filter((v): v is number => v != null);
    return c.json({
      ticker, perfil: perfil[0] ?? null, cotacao: cot[0] ?? null,
      historico: h.slice(-24),
      emissoes: emissoesDe(h.filter((r) => r.cotas != null).map((r) => ({ mes: r.mes, cotas: String(r.cotas) }))),
      rendimento_12m: ult12.length === 12 ? Math.round(ult12.reduce((s, v) => s + v, 0) * 100) / 100 : null,
      noticias: not[0]?.resumo || (not[0]?.documentos as unknown[] | undefined)?.length ? not[0] : null,
      em_carteira: Boolean(meu[0]?.em_carteira), acompanhando: Boolean(meu[0]?.acompanhando),
    });
  });

  /** Acompanhar um fundo antes de comprar: os jobs passam a buscar dados dele. */
  app.post("/api/investimentos/acompanhar", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    const ticker = String(b.ticker ?? "").trim().toUpperCase();
    if (!TICKER_FII.test(ticker)) return c.json({ erro: "Código de fundo como MXRF11." }, 400);
    await rodar(c, [consulta("insert into asset_watchlist (user_id, ticker) values (current_app_user(), $1) on conflict do nothing", ticker)]);
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/investimentos/acompanhar/:ticker", async (c) => {
    await rodar(c, [consulta("delete from asset_watchlist where ticker = $1", c.req.param("ticker").toUpperCase())]);
    return c.json({ ok: true });
  });
}
