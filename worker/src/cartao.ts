import { comprometido, deDigitado, faturasDe, type LinhaDeFatura, paraNumeric } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const MES = /^\d{4}-\d{2}$/;
const hojeEmSaoPaulo = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function rotasDoCartao<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  /** Cartões, as faturas de cada um por mês de vencimento e as compras da escolhida. */
  app.get("/api/cartao", async (c) => {
    const pedida = c.req.query("fatura");
    const [cartoes = [], faturas = [], compras = []] = await rodar(c, [
      consulta(
        `select a.id, a.name as nome, t.closing_day as fechamento, t.due_day as vencimento
           from accounts a
           left join account_terms t on t.account_id = a.id and t.vigencia @> current_date
          where a.kind = 'credit_card' and a.active order by a.name`,
      ),
      consulta(
        `with compras as (
            select account_id, invoice_month as mes, -sum(amount) as total
              from transactions where invoice_month is not null group by 1, 2),
          pagos as (
            select account_id, settles_invoice_month as mes, sum(amount) as pago
              from transactions where settles_invoice_month is not null group by 1, 2)
         select c.account_id as cartao, c.mes::text as mes, c.total::numeric(14,2)::text as total,
                coalesce(p.pago, 0)::numeric(14,2)::text as pago
           from compras c left join pagos p using (account_id, mes)
          order by c.mes`,
      ),
      consulta(
        `select t.id, t.account_id as cartao, t.invoice_month::text as mes, t.occurred_on::text as data, t.description as descricao,
                (-t.amount)::text as valor, k.name as categoria, t.installment_no as parcela, t.installment_total as parcelas
           from transactions t left join categories k on k.id = t.category_id
          where t.invoice_month is not null and ($1::text is null or t.invoice_month = ($1 || '-01')::date)
          order by t.occurred_on desc limit 300`,
        pedida && MES.test(pedida) ? pedida : null,
      ),
    ]);
    const hoje = hojeEmSaoPaulo();
    const n = paraNumeric;
    return c.json({
      cartoes: cartoes.map((k) => {
        const fs = faturasDe(faturas.filter((f) => f.cartao === k.id) as unknown as LinhaDeFatura[], Number(k.vencimento ?? 10), hoje);
        return {
          id: k.id, nome: k.nome, fechamento: k.fechamento, vencimento: k.vencimento, comprometido: n(comprometido(fs)),
          faturas: fs.map((f) => ({ mes: f.mes.slice(0, 7), vencimento: f.vencimento, total: n(f.total), pago: n(f.pago), falta: n(f.falta), situacao: f.situacao })),
        };
      }),
      compras: compras.map((x) => ({ ...x, mes: String(x.mes).slice(0, 7) })),
    });
  });

  /** Pagar fatura: transferência com a perna de entrada apontando a fatura que quita (ADR-010). */
  app.post("/api/pagar-fatura", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const cartao = String(b.cartao_id ?? ""), origem = String(b.conta_id ?? ""), mes = String(b.mes ?? ""), data = String(b.data ?? hojeEmSaoPaulo());
    if (!UUID.test(cartao) || !UUID.test(origem) || !MES.test(mes) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return c.json({ erro: "Pedido inválido." }, 400);
    let valor: string;
    try {
      const v = deDigitado(String(b.valor ?? ""));
      if (v <= 0n) throw new Error();
      valor = paraNumeric(v);
    } catch {
      return c.json({ erro: "Digite o valor como 843,40." }, 400);
    }
    const transferencia = crypto.randomUUID();
    const descricao = `Pagamento da fatura de ${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
    try {
      const [saida = [], entrada = []] = await rodar(c, [
        consulta(
          `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id)
           select current_app_user(), 'transfer', a.id, -$2::numeric, $3::date, $4, $5::uuid from accounts a
            where a.id = $1 and a.kind in ('checking', 'cash') returning id`,
          origem, valor, data, descricao, transferencia,
        ),
        consulta(
          `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id, settles_invoice_month)
           select current_app_user(), 'transfer', a.id, $2::numeric, $3::date, $4, $5::uuid, ($6 || '-01')::date from accounts a
            where a.id = $1 and a.kind = 'credit_card' returning id`,
          cartao, valor, data, descricao, transferencia, mes,
        ),
      ]);
      // Se uma das pernas não entrou, o trigger de soma zero recusa o commit; chegar aqui com
      // uma só é impossível, mas a resposta não deve fingir sucesso.
      if (!saida.length || !entrada.length) return c.json({ erro: "Conta de origem ou cartão não encontrados." }, 400);
      return c.json({ ok: true }, 201);
    } catch (e) {
      if (/^(22|23)/.test((e as { code?: string })?.code ?? "")) return c.json({ erro: "Conta de origem ou cartão não encontrados." }, 400);
      throw e;
    }
  });
}
