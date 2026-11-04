import { deDigitado, deNumeric, descontoDe, paraNumeric } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
const erroDeDado = (e: unknown) => /^(22|23)/.test((e as { code?: string })?.code ?? "");
type Corpo = Record<string, unknown>;
const corpo = (c: { req: { json<T>(): Promise<T> } }) => c.req.json<Corpo>().catch(() => ({}) as Corpo);
const valorDe = (t: unknown) => { const v = deDigitado(String(t ?? "")); if (v <= 0n) throw new Error(); return paraNumeric(v); };

export function rotasDaAtencao<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>, ptax: (env: E) => Promise<string | null>) {
  app.get("/api/contas-recorrentes", async (c) => {
    const [l = []] = await rodar(c, [consulta(
      `select b.id, b.name as nome, b.amount::text as valor, b.due_day as dia, b.urgency as urgencia, b.varies as varia,
              b.category_id as categoria_id, b.account_id as conta_id from recurring_bills b
        where b.valid_until is null or b.valid_until >= current_date order by b.due_day, b.name`)]);
    return c.json({ contas: l });
  });

  app.post("/api/contas-recorrentes", async (c) => {
    const b = await corpo(c);
    const dia = Number(b.dia), urgencia = String(b.urgencia ?? "important");
    let valor: string;
    try { valor = valorDe(b.valor); } catch { return c.json({ erro: "Digite o valor como 120,00." }, 400); }
    if (!String(b.nome ?? "").trim() || !(dia >= 1 && dia <= 31) || !["essential", "important", "deferrable"].includes(urgencia) || !UUID.test(String(b.categoria_id)) || !UUID.test(String(b.conta_id)))
      return c.json({ erro: "Preencha nome, valor, dia, categoria e conta." }, 400);
    try {
      const [l = []] = await rodar(c, [consulta(
        `insert into recurring_bills (user_id, name, amount, due_day, category_id, account_id, urgency, varies, valid_from)
         values (current_app_user(), $1, $2::numeric, $3, $4, $5, $6::bill_urgency, $7, date_trunc('month', current_date)::date) returning id`,
        String(b.nome).trim().slice(0, 80), valor, dia, b.categoria_id, b.conta_id, urgencia, Boolean(b.varia))]);
      return c.json({ id: l[0]?.id }, 201);
    } catch (e) { if (erroDeDado(e)) return c.json({ erro: "Conta ou categoria não encontrada." }, 400); throw e; }
  });

  app.post("/api/entradas-previstas", async (c) => {
    const b = await corpo(c);
    const moeda = b.moeda === "USD" ? "USD" : "BRL", data = String(b.data ?? "");
    let valor: string;
    try { valor = valorDe(b.valor); } catch { return c.json({ erro: "Digite o valor como 300,00." }, 400); }
    if (!String(b.descricao ?? "").trim() || !DATA.test(data) || !UUID.test(String(b.conta_id)) || !UUID.test(String(b.categoria_id)))
      return c.json({ erro: "Preencha descrição, valor, data, conta e categoria." }, 400);
    try {
      const [l = []] = await rodar(c, [consulta(
        `insert into expected_incomes (user_id, description, currency, amount, expected_on, account_id, category_id)
         select current_app_user(), $1, $2, $3::numeric, $4::date, $5, k.id from categories k where k.id = $6 and k.kind = 'income' returning id`,
        String(b.descricao).trim().slice(0, 80), moeda, valor, data, b.conta_id, b.categoria_id)]);
      return l.length ? c.json({ id: l[0]?.id }, 201) : c.json({ erro: "A categoria precisa ser de receita." }, 400);
    } catch (e) { if (erroDeDado(e)) return c.json({ erro: "Conta não encontrada." }, 400); throw e; }
  });

  /** Chegou: vira receita pelo valor em reais, e o desconto do PayPal contra a PTAX fica guardado. */
  app.post("/api/entradas-previstas/:id/receber", async (c) => {
    const id = c.req.param("id"), b = await corpo(c);
    if (!UUID.test(id)) return c.json({ erro: "Pedido inválido." }, 400);
    let recebido: bigint;
    try { recebido = deDigitado(String(b.recebido ?? "")); if (recebido <= 0n) throw new Error(); } catch { return c.json({ erro: "Digite quanto chegou em reais, como 1.587,49." }, 400); }
    const data = DATA.test(String(b.data ?? "")) ? String(b.data) : hojeEmSaoPaulo();
    const [ent = []] = await rodar(c, [consulta("select currency as moeda, amount::text as valor from expected_incomes where id = $1 and transaction_id is null", id)]);
    if (!ent[0]) return c.json({ erro: "Entrada prevista não encontrada ou já recebida." }, 404);
    const cotacao = ent[0].moeda === "USD" ? await ptax(c.env).catch(() => null) : null;
    const desconto = cotacao ? descontoDe(deNumeric(String(ent[0].valor)), recebido, cotacao).centavos : null;
    const lancamento = crypto.randomUUID();
    const [, atualizada = []] = await rodar(c, [
      consulta(
        `insert into transactions (id, user_id, kind, account_id, category_id, amount, occurred_on, description)
         select $4::uuid, current_app_user(), 'income', e.account_id, e.category_id, $2::numeric, $3::date, e.description
           from expected_incomes e where e.id = $1 and e.transaction_id is null`,
        id, paraNumeric(recebido), data, lancamento),
      consulta(
        `update expected_incomes set transaction_id = $5::uuid, received_brl = $2::numeric, reference_rate = $3::numeric, fee_brl = $4::numeric
          where id = $1 and transaction_id is null
         returning fee_brl::text as desconto`,
        id, paraNumeric(recebido), cotacao, desconto === null ? null : paraNumeric(desconto), lancamento),
    ]);
    return c.json({ desconto: atualizada[0]?.desconto ?? null, ptax: cotacao });
  });

  /** "Lembrar amanhã" (ate = amanhã) e "Resolvido" (ate = null). */
  app.post("/api/atencao/adiar", async (c) => {
    const b = await corpo(c);
    const chave = String(b.chave ?? ""), ate = b.ate == null ? null : String(b.ate);
    if (!/^[a-z]+:[0-9a-f:-]{8,}/i.test(chave) || chave.length > 120 || (ate !== null && !DATA.test(ate))) return c.json({ erro: "Pedido inválido." }, 400);
    await rodar(c, [consulta(
      `insert into attention_snoozes (user_id, item_key, until) values (current_app_user(), $1, $2::date)
       on conflict (user_id, item_key) do update set until = excluded.until`, chave, ate)]);
    return c.json({ ok: true });
  });
}
