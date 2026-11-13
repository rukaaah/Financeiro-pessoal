import { deDigitado, paraNumeric } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";
import { consultasDoMes, hojeEmSaoPaulo, montarMes } from "./contexto.ts";

const MES = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export function rotasDoMes<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>, ptax: (env: E) => Promise<string | null>) {
  app.get("/api/mes", async (c) => {
    const mes = c.req.query("mes") ?? hojeEmSaoPaulo().slice(0, 7);
    if (!MES.test(mes)) return c.json({ erro: "Mês inválido." }, 400);
    const hoje = hojeEmSaoPaulo();
    const [linhas, cotacao] = await Promise.all([rodar(c, consultasDoMes(mes, hoje)), ptax(c.env).catch(() => null)]);
    return c.json(montarMes(mes, hoje, linhas, cotacao));
  });

  app.get("/api/categoria/:id", async (c) => {
    const id = c.req.param("id"), mes = c.req.query("mes") ?? hojeEmSaoPaulo().slice(0, 7);
    if (!UUID.test(id) || !MES.test(mes)) return c.json({ erro: "Pedido inválido." }, 400);
    const [serie = [], lancs = []] = await rodar(c, [
      consulta(
        `with meses as (select generate_series(($2 || '-01')::date - interval '11 months', ($2 || '-01')::date, interval '1 month')::date as mm)
         select to_char(mm, 'YYYY-MM') as mes,
                coalesce((select sum(abs(t.amount)) from transactions t where t.category_id = $1 and t.kind in ('income','expense')
                           and mes_do_orcamento(t.occurred_on, t.invoice_month) = mm), 0)::numeric(14,2)::text as gasto,
                (select p.previsto::text from previsto_do_mes(mm) p where p.category_id = $1) as previsto
           from meses order by mm`,
        id, mes,
      ),
      consulta(
        `select t.id, t.occurred_on::text as data, t.description as descricao, t.amount::text as valor, a.name as conta
           from transactions t join accounts a on a.id = t.account_id
          where t.category_id = $1 and t.kind in ('income','expense')
            and mes_do_orcamento(t.occurred_on, t.invoice_month) = ($2 || '-01')::date
          order by t.occurred_on desc limit 100`,
        id, mes,
      ),
    ]);
    return c.json({ serie, lancamentos: lancs });
  });

  /** Ajuste só deste mês, ou novo padrão a partir deste mês (ADR-019). */
  app.put("/api/previsto", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const id = String(b.categoria_id ?? ""), mes = String(b.mes ?? "");
    if (!UUID.test(id) || !MES.test(mes)) return c.json({ erro: "Pedido inválido." }, 400);
    let valor: string;
    try {
      const v = deDigitado(String(b.valor ?? ""));
      if (v < 0n) throw new Error();
      valor = paraNumeric(v);
    } catch {
      return c.json({ erro: "Digite o valor como 600,00." }, 400);
    }
    const sql = b.padrao
      ? `insert into budget_templates (user_id, category_id, amount, valid_from)
         select current_app_user(), k.id, $2::numeric, ($3 || '-01')::date from categories k where k.id = $1
         on conflict (category_id, valid_from) do update set amount = excluded.amount returning id`
      : `insert into budget_adjustments (user_id, category_id, month, amount)
         select current_app_user(), k.id, ($3 || '-01')::date, $2::numeric from categories k where k.id = $1
         on conflict (category_id, month) do update set amount = excluded.amount returning id`;
    const [l = []] = await rodar(c, [consulta(sql, id, valor, mes)]);
    return l.length ? c.json({ ok: true }) : c.json({ erro: "Categoria não encontrada." }, 404);
  });
}
