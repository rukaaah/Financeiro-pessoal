import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }) });
const json = { "content-type": "application/json" };
type Resp = { cartoes: { id: string; comprometido: string; faturas: { mes: string; total: string; pago: string; situacao: string }[] }[]; compras: { mes: string }[] };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'G') returning id", [u]);
  const k = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Jogos', 'expense') returning id", [u, g]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.unicred = await q("insert into accounts (user_id, name, kind) values ($1, 'Unicred', 'credit_card') returning id", [u]);
  await owner.query("insert into account_terms (user_id, account_id, vigencia, closing_day, due_day) values ($1, $2, '[2020-01-01,)', 4, 11)", [u, ids.unicred]);
  // Compra de 300 em 3x feita bem no futuro, para as três faturas ainda estarem por vencer em qualquer data do CI.
  const grupo = crypto.randomUUID();
  for (const n of [1, 2, 3])
    await owner.query("insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, installment_no, installment_total, installment_group_id) values ($1, 'expense', $2, $3, -100, '2099-03-02', $4, 3, $5)", [u, ids.unicred, k, n, grupo]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("cartão pelo Worker, como papel app", () => {
  it("parcelas caem em três faturas: a primeira aberta, as outras comprometidas", async () => {
    const r = (await (await como("a").request("/api/cartao")).json()) as Resp;
    const c = r.cartoes[0]!;
    expect(c.faturas.map((f) => [f.mes, f.total, f.situacao])).toEqual([["2099-03", "100.00", "aberta"], ["2099-04", "100.00", "futura"], ["2099-05", "100.00", "futura"]]);
    expect(c.comprometido).toBe("200.00");
  });

  it("pagar parte deixa parcial; pagar o resto deixa paga; pagamento não é gasto", async () => {
    const pagar = (valor: string) => como("a").request("/api/pagar-fatura", { method: "POST", headers: json, body: JSON.stringify({ cartao_id: ids.unicred, conta_id: ids.picpay, mes: "2099-03", valor, data: "2099-03-10" }) });
    expect((await pagar("40,00")).status).toBe(201);
    let f = ((await (await como("a").request("/api/cartao")).json()) as Resp).cartoes[0]!.faturas[0]!;
    expect([f.pago, f.situacao]).toEqual(["40.00", "aberta"]);
    expect((await pagar("60,00")).status).toBe(201);
    f = ((await (await como("a").request("/api/cartao")).json()) as Resp).cartoes[0]!.faturas[0]!;
    expect([f.pago, f.situacao]).toEqual(["100.00", "paga"]);
    const gasto = (await owner.query("select count(*)::int n from transactions where account_id = $1 and kind = 'expense' and occurred_on = '2099-03-10'", [ids.picpay])).rows[0].n;
    expect(gasto).toBe(0);
  });

  it("B não paga a fatura de A nem vê o cartão de A", async () => {
    const r = await como("b").request("/api/pagar-fatura", { method: "POST", headers: json, body: JSON.stringify({ cartao_id: ids.unicred, conta_id: ids.picpay, mes: "2099-03", valor: "1,00", data: "2099-03-10" }) });
    expect(r.status).toBe(400);
    expect(((await (await como("b").request("/api/cartao")).json()) as Resp).cartoes).toEqual([]);
  });
});
