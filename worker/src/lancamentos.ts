import { deDigitado, deNumeric, LancamentoInvalido, linhasDe, paraNumeric, type Intencao } from "@financeiro/dominio";
import type { Hono } from "hono";
import { consulta } from "./banco.ts";
import type { Rodar } from "./app.ts";

const MES = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Erro do Postgres que é culpa do pedido (CHECK, FK, trigger da fatura), não do servidor. */
function ehErroDeDado(e: unknown): boolean {
  const codigo = (e as { code?: string })?.code ?? "";
  return /^(22|23)/.test(codigo);
}

export function rotasDeLancamentos<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/opcoes", async (c) => {
    const [contas, categorias] = await rodar(c, [
      consulta(`select id, name as nome, kind as tipo from accounts
                 where active and kind in ('checking','credit_card','cash') order by kind, name`),
      consulta(`select c.id, c.name as nome, c.kind as tipo, g.name as grupo from categories c
                  join category_groups g on g.id = c.group_id
                 where c.active order by g.sort_order, g.name, c.name`),
    ]);
    return c.json({ contas, categorias });
  });

  app.get("/api/lancamentos", async (c) => {
    const mes = c.req.query("mes") ?? new Date().toISOString().slice(0, 7);
    if (!MES.test(mes)) return c.json({ erro: "Mês inválido." }, 400);
    const [linhas = []] = await rodar(c, [
      consulta(
        `select t.id, t.kind as tipo, t.amount::text as valor, t.occurred_on::text as data, t.description as descricao,
                t.invoice_month::text as mes_da_fatura, t.installment_no as parcela, t.installment_total as parcelas,
                c.name as categoria, c.id as categoria_id, a.name as conta, a.kind as tipo_conta, a2.name as conta_destino
           from transactions t
           join accounts a on a.id = t.account_id
           left join categories c on c.id = t.category_id
           left join transactions t2 on t2.transfer_id = t.transfer_id and t2.id <> t.id
           left join accounts a2 on a2.id = t2.account_id
          where t.occurred_on >= ($1 || '-01')::date and t.occurred_on < ($1 || '-01')::date + interval '1 month'
            and (t.kind <> 'transfer' or t.amount < 0)
          order by t.occurred_on desc, t.created_at desc
          limit 500`,
        mes,
      ),
    ]);
    // Totais pela data, sem transferências e sem compras no cartão (que contam no mês da fatura).
    let entrou = 0n, saiu = 0n;
    for (const l of linhas) {
      const v = deNumeric(String(l.valor));
      if (l.tipo === "income") entrou += v;
      if (l.tipo === "expense" && l.tipo_conta !== "credit_card") saiu -= v;
    }
    return c.json({ mes, lancamentos: linhas, entrou: paraNumeric(entrou), saiu: paraNumeric(saiu) });
  });

  app.get("/api/fatura-prevista", async (c) => {
    const conta = c.req.query("conta") ?? "", data = c.req.query("data") ?? "";
    if (!UUID.test(conta) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return c.json({ mes_da_fatura: null });
    try {
      const [l = []] = await rodar(c, [
        consulta(
          `select invoice_month_for(a.id, $2::date, 1::smallint)::text as mes_da_fatura
             from accounts a where a.id = $1 and a.kind = 'credit_card'`,
          conta, data,
        ),
      ]);
      return c.json({ mes_da_fatura: l[0]?.mes_da_fatura ?? null });
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ mes_da_fatura: null });
      throw e;
    }
  });

  app.post("/api/lancamentos", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    let linhas;
    try {
      linhas = linhasDe({
        intencao: b.intencao as Intencao,
        valor: deDigitado(String(b.valor ?? "")),
        contaId: String(b.conta_id ?? ""),
        categoriaId: String(b.categoria_id ?? ""),
        data: String(b.data ?? ""),
        descricao: String(b.descricao ?? "").slice(0, 200),
        parcelas: Number(b.parcelas ?? 1),
      });
      if (b.intencao !== "gastei" && b.intencao !== "recebi") throw new LancamentoInvalido("Intenção desconhecida.");
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : "Lançamento inválido." }, 400);
    }
    const grupo = linhas.length > 1 ? crypto.randomUUID() : null;
    try {
      const resultados = await rodar(
        c,
        linhas.map((l) =>
          consulta(
            // A categoria precisa ser do tipo do lançamento: despesa em categoria de despesa.
            `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description,
                                       installment_no, installment_total, installment_group_id, recurring_bill_id)
             select current_app_user(), $1::transaction_kind, $2::uuid, k.id, $4::numeric, $5::date, $6, $7, $8, $9::uuid, $10::uuid
               from categories k where k.id = $3::uuid and k.kind::text = $1::text and k.active
             returning id, invoice_month::text as mes_da_fatura`,
            l.tipo, b.conta_id, b.categoria_id, paraNumeric(l.valor), b.data, String(b.descricao ?? "").slice(0, 200),
            l.parcela, l.totalDeParcelas, grupo, UUID.test(String(b.conta_recorrente_id ?? "")) ? b.conta_recorrente_id : null,
          ),
        ),
      );
      const ids = resultados.flat();
      if (ids.length !== linhas.length) return c.json({ erro: "Categoria não encontrada para este tipo de lançamento." }, 400);
      return c.json({ ids: ids.map((r) => r.id), mes_da_fatura: ids[0]?.mes_da_fatura ?? null }, 201);
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ erro: "O banco recusou o lançamento. Confira conta, categoria e data." }, 400);
      throw e;
    }
  });

  app.patch("/api/lancamentos/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Lançamento inválido." }, 400);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    let valor: string | null = null;
    try {
      if (b.valor != null) {
        const v = deDigitado(String(b.valor));
        if (v <= 0n) throw new LancamentoInvalido("O valor precisa ser maior que zero.");
        valor = paraNumeric(v);
      }
    } catch (e) {
      return c.json({ erro: e instanceof Error ? e.message : "Valor inválido." }, 400);
    }
    try {
      const [l = []] = await rodar(c, [
        consulta(
          // Parcela e transferência não se editam por aqui: mexeriam nas outras linhas.
          `update transactions set
               description = coalesce($2, description),
               amount = case when $3::numeric is null then amount else sign(amount) * $3::numeric end,
               occurred_on = coalesce($4::date, occurred_on)
             where id = $1 and transfer_id is null and installment_group_id is null
           returning id`,
          id, b.descricao == null ? null : String(b.descricao).slice(0, 200), valor, b.data ?? null,
        ),
      ]);
      return l.length ? c.json({ id }) : c.json({ erro: "Lançamento não encontrado ou não editável aqui." }, 404);
    } catch (e) {
      if (ehErroDeDado(e)) return c.json({ erro: "O banco recusou a alteração." }, 400);
      throw e;
    }
  });

  app.delete("/api/lancamentos/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ erro: "Lançamento inválido." }, 400);
    // Compra parcelada sai inteira; transferência sai com as duas pernas.
    const [l = []] = await rodar(c, [
      consulta(
        `delete from transactions t using transactions alvo
          where alvo.id = $1
            and (t.id = alvo.id or t.installment_group_id = alvo.installment_group_id or t.transfer_id = alvo.transfer_id)
         returning t.id`,
        id,
      ),
    ]);
    return l.length ? c.json({ excluidos: l.length }) : c.json({ erro: "Lançamento não encontrado." }, 404);
  });
}
