import { aDevolver, deDigitado, deNumeric, deveriaTer, paraNumeric, patrimonioLiquido } from "@financeiro/dominio";
import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
import { consulta } from "./banco.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";

const UUID = /^[0-9a-f-]{36}$/i, DATA = /^\d{4}-\d{2}-\d{2}$/;
type Corpo = Record<string, unknown>;
const erroDeDado = (e: unknown) => /^(22|23)/.test((e as { code?: string })?.code ?? "");

const SQL_CONTAS = `
  select a.id, a.name as nome, a.kind as tipo, cp.name as pessoa,
         coalesce((select sum(t.amount) from transactions t where t.account_id = a.id and t.occurred_on <= $1::date), 0)::numeric(14,2)::text as saldo,
         (select max(t.occurred_on)::text from transactions t where t.account_id = a.id) as ultimo,
         (select r.reconciled_on::text from reconciliations r where r.account_id = a.id order by r.reconciled_on desc, r.created_at desc limit 1) as conciliado,
         gs.target::text as meta, gs.target_date::text as data_meta, gs.started_on::text as inicio, gs.cdi_percent::text as cdi,
         coalesce((select -sum(t.amount) from transactions t where t.account_id = a.id and t.goal_movement = 'loan'), 0)::numeric(14,2)::text as emprestado,
         coalesce((select sum(t.amount) from transactions t where t.account_id = a.id and t.goal_movement = 'repayment'), 0)::numeric(14,2)::text as devolvido
    from accounts a
    left join counterparties cp on cp.id = a.counterparty_id
    left join goal_settings gs on gs.account_id = a.id
   where a.active order by a.kind, a.name`;

const SQL_RECEBER_ITENS = `
  select t.account_id as conta, t.occurred_on::text as data, t.description as descricao, t.amount::text as valor
    from transactions t join accounts a on a.id = t.account_id
   where a.kind = 'receivable' order by t.occurred_on desc limit 50`;

const SQL_PAYPAL = `
  select coalesce(sum(fee_brl), 0)::numeric(14,2)::text as total, count(*)::int as n
    from expected_incomes where fee_brl is not null and extract(year from expected_on) = extract(year from $1::date)`;

function transferencia(origem: string, destino: string, valor: string, data: string, descricao: string, movOrigem: string | null, movDestino: string | null, tiposOrigem: string[], tiposDestino: string[]) {
  const id = crypto.randomUUID();
  const perna = (conta: string, sinal: string, mov: string | null, tipos: string[]) => consulta(
    `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id, goal_movement)
     select current_app_user(), 'transfer', a.id, ${sinal}$2::numeric, $3::date, $4, $5::uuid, $6::goal_movement
       from accounts a where a.id = $1 and a.kind::text = any($7::text[]) returning id`,
    conta, valor, data, descricao, id, mov, tipos);
  return [perna(origem, "-", movOrigem, tiposOrigem), perna(destino, "", movDestino, tiposDestino)];
}

export function rotasDoPatrimonio<E extends object>(app: Hono<{ Bindings: E }>, rodar: Rodar<E>) {
  app.get("/api/patrimonio", async (c) => {
    const hoje = hojeEmSaoPaulo();
    const [contas = [], itens = [], paypal = []] = await rodar(c, [consulta(SQL_CONTAS, hoje), consulta(SQL_RECEBER_ITENS), consulta(SQL_PAYPAL, hoje)]);
    const soma = (tipos: string[]) => contas.filter((k) => tipos.includes(String(k.tipo))).reduce((s, k) => s + deNumeric(String(k.saldo)), 0n);
    const partes = { contas: soma(["checking", "cash"]), cofrinhos: soma(["goal"]), investimentos: soma(["investment"]), cartao: -soma(["credit_card"]) };
    const n = paraNumeric;
    return c.json({
      patrimonio: n(patrimonioLiquido(partes)), partes: Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, n(v)])),
      a_receber: n(soma(["receivable"])),
      paypal: { total: String(paypal[0]?.total ?? "0.00"), recebimentos: Number(paypal[0]?.n ?? 0) },
      contas: contas.filter((k) => ["checking", "cash", "investment"].includes(String(k.tipo))).map((k) => ({ id: k.id, nome: k.nome, tipo: k.tipo, saldo: k.saldo, ultimo: k.ultimo, conciliado: k.conciliado })),
      cofrinhos: contas.filter((k) => k.tipo === "goal").map((k) => {
        const saldo = deNumeric(String(k.saldo)), meta = k.meta ? deNumeric(String(k.meta)) : null;
        return {
          id: k.id, nome: k.nome, saldo: k.saldo, meta: k.meta ?? null, data_meta: k.data_meta ?? null, cdi: k.cdi ?? null,
          deveria: meta && k.data_meta ? n(deveriaTer(meta, String(k.inicio), String(k.data_meta), hoje)) : null,
          a_devolver: n(aDevolver(deNumeric(String(k.emprestado)), deNumeric(String(k.devolvido)))), progresso: meta ? Number((saldo * 1000n) / meta) / 10 : null,
        };
      }),
      receber: contas.filter((k) => k.tipo === "receivable").map((k) => ({ id: k.id, nome: k.nome, pessoa: k.pessoa, saldo: k.saldo, itens: itens.filter((i) => i.conta === k.id).slice(0, 10) })),
    });
  });

  app.post("/api/guardar", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    return mover(c, String(b.conta_id), String(b.cofrinho_id), b.valor, b.data, b.devolucao ? "Devolução ao cofrinho" : "Guardei no cofrinho", null, b.devolucao ? "repayment" : null, ["checking", "cash"], ["goal"]);
  });

  app.post("/api/resgatar", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    const fin = String(b.finalidade ?? "");
    if (!["use", "loan", "withdrawal"].includes(fin)) return c.json({ erro: "Escolha para quê é o resgate." }, 400);
    const rotulo = { use: "Resgate para o objetivo", loan: "Empréstimo do cofrinho", withdrawal: "Retirada do cofrinho" }[fin as "use"];
    return mover(c, String(b.cofrinho_id), String(b.conta_id), b.valor, b.data, rotulo, fin, null, ["goal"], ["checking", "cash"]);
  });

  /** Pessoa pagou de volta o que eu adiantei (RF17). */
  app.post("/api/receber-de", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    return mover(c, String(b.receber_id), String(b.conta_id), b.valor, b.data, "Recebimento", null, null, ["receivable"], ["checking", "cash"]);
  });

  async function mover(c: Parameters<Rodar<E>>[0], origem: string, destino: string, valorBruto: unknown, dataBruta: unknown, descricao: string, movOrigem: string | null, movDestino: string | null, tiposOrigem: string[], tiposDestino: string[]) {
    if (!UUID.test(origem) || !UUID.test(destino)) return c.json({ erro: "Escolha as contas." }, 400);
    let valor: string;
    try { const v = deDigitado(String(valorBruto ?? "")); if (v <= 0n) throw new Error(); valor = paraNumeric(v); } catch { return c.json({ erro: "Digite o valor como 100,00." }, 400); }
    const data = DATA.test(String(dataBruta ?? "")) ? String(dataBruta) : hojeEmSaoPaulo();
    try {
      const [a = [], b = []] = await rodar(c, transferencia(origem, destino, valor, data, descricao, movOrigem, movDestino, tiposOrigem, tiposDestino));
      if (!a.length || !b.length) return c.json({ erro: "Conta não encontrada." }, 400);
      return c.json({ ok: true }, 201);
    } catch (e) {
      // Uma perna sem a outra é recusada pelo trigger de soma zero no commit.
      if (erroDeDado(e)) return c.json({ erro: "Conta não encontrada." }, 400);
      throw e;
    }
  }

  app.post("/api/conciliar", async (c) => {
    const b = await c.req.json<Corpo>().catch(() => ({}) as Corpo);
    const conta = String(b.conta_id ?? "");
    let banco: bigint;
    try { banco = deDigitado(String(b.saldo_banco ?? "")); } catch { return c.json({ erro: "Digite o saldo como 1.840,35." }, 400); }
    if (!UUID.test(conta)) return c.json({ erro: "Escolha a conta." }, 400);
    const hoje = hojeEmSaoPaulo();
    const [l = []] = await rodar(c, [consulta(
      `insert into reconciliations (user_id, account_id, reconciled_on, bank_balance, app_balance)
       select current_app_user(), a.id, $2::date, $3::numeric,
              coalesce((select sum(t.amount) from transactions t where t.account_id = a.id and t.occurred_on <= $2::date), 0)
         from accounts a where a.id = $1 returning app_balance::text as app`,
      conta, hoje, paraNumeric(banco))]);
    if (!l[0]) return c.json({ erro: "Conta não encontrada." }, 404);
    return c.json({ diferenca: paraNumeric(banco - deNumeric(String(l[0].app))) });
  });
}
