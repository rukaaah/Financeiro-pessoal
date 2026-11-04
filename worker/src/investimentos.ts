import { type AtivoNaCarteira, type Classe, deDecimal6, deDigitado, NOME_DA_CLASSE, ondeAportar, paraNumeric, posicaoDe, valorDe } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const CLASSES = Object.keys(NOME_DA_CLASSE) as Classe[];
type Corpo = Record<string, unknown>;

const SQL_ATIVOS = `
  select a.id, a.ticker, a.name as nome, a.class as classe,
         coalesce(json_agg(json_build_object('quantidade', t.quantity::text, 'preco', t.unit_price::text) order by t.traded_on, t.created_at)
                  filter (where t.id is not null), '[]') as operacoes,
         q.price::text as preco, q.pvp::float as pvp, q.dy_12m::float as dy, q.liquidity::float as liquidez, q.quoted_on::text as cotado_em,
         q0.price::text as preco_mes_passado
    from assets a
    left join asset_trades t on t.asset_id = a.id
    left join lateral (select * from asset_quotes x where x.ticker = a.ticker order by quoted_on desc limit 1) q on true
    left join lateral (select * from asset_quotes x where x.ticker = a.ticker and x.quoted_on < date_trunc('month', current_date) order by quoted_on desc limit 1) q0 on true
   group by a.id, q.price, q.pvp, q.dy_12m, q.liquidity, q.quoted_on, q0.price
   order by a.class, a.ticker`;

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

export function rotasDeInvestimentos<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/investimentos", async (c) => {
    const aporte = (() => { try { return deDigitado(c.req.query("aporte") ?? "500"); } catch { return 50000n; } })();
    const [ativosL = [], series = [], regrasL = []] = await rodar(c, [consulta(SQL_ATIVOS), consulta(SQL_SERIES), consulta(SQL_REGRAS)]);
    const ativos = ativosL.map((a) => {
      const pos = posicaoDe(a.operacoes as { quantidade: string; preco: string }[]);
      const valor = valorDe(pos, a.preco ? String(a.preco) : null);
      const mesPassado = a.preco_mes_passado ? valorDe(pos, String(a.preco_mes_passado)) : null;
      return { a, pos, valor, mesPassado };
    });
    const total = ativos.reduce((s, x) => s + x.valor, 0n);
    const r = regrasL[0] ?? {};
    const regras = { maxPvp: Number(r.max_pvp ?? 1), maxPeso: Number(r.max_peso ?? 20), minLiquidez: Number(r.min_liquidez ?? 500000), metas: (r.metas ?? {}) as Partial<Record<Classe, number>> };
    const carteira: AtivoNaCarteira[] = ativos.map(({ a, valor }) => ({ ticker: String(a.ticker), classe: a.classe as Classe, valor, preco: a.preco ? String(a.preco) : null, pvp: a.pvp == null ? null : Number(a.pvp), liquidez: a.liquidez == null ? null : Number(a.liquidez) }));
    const sugestao = ondeAportar(carteira, regras, aporte);
    const n = paraNumeric;
    return c.json({
      total: n(total), custo: n(ativos.reduce((s, x) => s + x.pos.custo, 0n)),
      variacao_mes: n(ativos.reduce((s, x) => s + (x.mesPassado != null ? x.valor - x.mesPassado : 0n), 0n)),
      ativos: ativos.map(({ a, pos, valor, mesPassado }) => ({
        id: a.id, ticker: a.ticker, nome: a.nome, classe: a.classe, classe_nome: NOME_DA_CLASSE[a.classe as Classe],
        quantidade: Number(pos.quantidade6) / 1e6, preco_medio: n(pos.precoMedio6 / 10000n),
        preco: a.preco ?? null, valor: n(valor), custo: n(pos.custo), peso: total > 0n ? Number((valor * 1000n) / total) / 10 : 0,
        variacao_pm: pos.custo > 0n ? Number(((valor - pos.custo) * 1000n) / pos.custo) / 10 : 0,
        variacao_mes: mesPassado != null && mesPassado > 0n ? Number(((valor - mesPassado) * 1000n) / mesPassado) / 10 : null,
        pvp: a.pvp, dy: a.dy, liquidez: a.liquidez, cotado_em: a.cotado_em,
      })),
      classes: CLASSES.map((k) => {
        const v = ativos.filter((x) => x.a.classe === k).reduce((s, x) => s + x.valor, 0n);
        return { classe: k, nome: NOME_DA_CLASSE[k], valor: n(v), peso: total > 0n ? Number((v * 1000n) / total) / 10 : 0, meta: regras.metas[k] ?? null };
      }).filter((k) => k.valor !== "0.00" || k.meta != null),
      series, regras,
      onde_aportar: { aporte: n(aporte), sugestoes: sugestao.sugestoes.map((s) => ({ ...s, valor: n(s.valor) })), fora: sugestao.fora, sobra: n(sugestao.sobra) },
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
}
