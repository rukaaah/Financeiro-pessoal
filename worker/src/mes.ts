import { deDigitado, deNumeric, formatar, type LinhaDeCategoria, paraNumeric, posicaoDoMes } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const MES = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const hojeEmSaoPaulo = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Previsto, realizado e média de 3 meses por categoria, pelo mês do orçamento (ADR-005, ADR-019). */
const SQL_CATEGORIAS = `
  with m as (select ($1 || '-01')::date as mes),
  mov as (
    select t.category_id, mes_do_orcamento(t.occurred_on, t.invoice_month) as mm, sum(abs(t.amount)) as v
      from transactions t, m
     where t.kind in ('income', 'expense')
       and mes_do_orcamento(t.occurred_on, t.invoice_month) between (m.mes - interval '3 months')::date and m.mes
     group by 1, 2
  )
  select c.id, c.name as nome, c.kind as tipo, g.name as grupo, p.previsto::text as previsto, p.ajustado,
         coalesce((select v from mov where mov.category_id = c.id and mov.mm = m.mes), 0)::numeric(14,2)::text as realizado,
         (coalesce((select sum(v) from mov where mov.category_id = c.id and mov.mm < m.mes), 0) / 3)::numeric(14,2)::text as media3m
    from m, categories c
    join category_groups g on g.id = c.group_id
    join previsto_do_mes((select mes from m)) p on p.category_id = c.id
   where c.active
   order by g.sort_order, g.name, c.name`;

/** Guardado no mês: entradas em cofrinho e investimento por transferência (RF14). */
const SQL_GUARDADO = `
  select coalesce(sum(t.amount), 0)::numeric(14,2)::text as guardado
    from transactions t join accounts a on a.id = t.account_id
   where t.kind = 'transfer' and t.amount > 0 and a.kind in ('goal', 'investment')
     and date_trunc('month', t.occurred_on) = ($1 || '-01')::date`;

export function rotasDoMes<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/mes", async (c) => {
    const mes = c.req.query("mes") ?? hojeEmSaoPaulo().slice(0, 7);
    if (!MES.test(mes)) return c.json({ erro: "Mês inválido." }, 400);
    const [linhas = [], guardado = []] = await rodar(c, [consulta(SQL_CATEGORIAS, mes), consulta(SQL_GUARDADO, mes)]);
    // Contas a pagar entram com as recorrentes, na fatia 5. Até lá, zero declarado.
    const p = posicaoDoMes(linhas as unknown as LinhaDeCategoria[], {
      mes, hoje: hojeEmSaoPaulo(), aPagar: 0n, guardado: deNumeric(String(guardado[0]?.guardado ?? "0")), formatar,
    });
    const n = paraNumeric;
    return c.json({
      mes, previsto: n(p.previsto), gasto: n(p.gasto), a_pagar: n(p.aPagar), livre: n(p.livre), por_dia: n(p.porDia),
      dia_do_mes: p.diaDoMes, dias_no_mes: p.diasNoMes, dias_restantes: p.diasRestantes,
      renda: n(p.renda), renda_prevista: n(p.rendaPrevista), guardado: n(p.guardado), sobra: n(p.sobra), descoberta: p.descoberta,
      categorias: p.categorias.map((k) => ({ id: k.id, nome: k.nome, grupo: k.grupo, previsto: n(k.previsto), gasto: n(k.gasto), media3m: n(k.media3m), ajustado: k.ajustado, estado: k.estado })),
    });
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
