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
type Mes = { previsto: string; gasto: string; livre: string; renda: string; categorias: { nome: string; previsto: string; gasto: string; estado: string; ajustado: boolean }[] };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'Essenciais') returning id", [u]);
  ids.mercado = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Mercado', 'expense') returning id", [u, g]);
  ids.salario = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Salário', 'income') returning id", [u, g]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.unicred = await q("insert into accounts (user_id, name, kind) values ($1, 'Unicred', 'credit_card') returning id", [u]);
  await owner.query("insert into account_terms (user_id, account_id, vigencia, closing_day, due_day) values ($1, $2, '[2020-01-01,)', 4, 11)", [u, ids.unicred]);
  // Padrão de 600 desde set; sobe para 800 a partir de dez. Novembro tem ajuste de 700.
  await owner.query("insert into budget_templates (user_id, category_id, amount, valid_from) values ($1, $2, 600, '2026-09-01'), ($1, $2, 800, '2026-12-01'), ($1, $3, 4200, '2026-09-01')", [u, ids.mercado, ids.salario]);
  await owner.query("insert into budget_adjustments (user_id, category_id, month, amount) values ($1, $2, '2026-11-01', 700)", [u, ids.mercado]);
  // Compra no cartão em 03/11 (antes do fechamento do dia 4): fatura que vence em 11/11, orçamento de novembro.
  // Compra em 05/11: fatura de dezembro. Débito em 02/11: novembro.
  await owner.query(
    `insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on) values
       ($1, 'expense', $2, $4, -100, '2026-11-03'), ($1, 'expense', $2, $4, -50, '2026-11-05'),
       ($1, 'expense', $3, $4, -30, '2026-11-02'), ($1, 'income', $3, $5, 4200, '2026-11-01'),
       ($1, 'expense', $3, $4, -600, '2026-10-10')`,
    [u, ids.unicred, ids.picpay, ids.mercado, ids.salario],
  );
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("posição do mês pelo Worker, como papel app", () => {
  it("previsto: ajuste do mês vence o padrão; gasto do cartão conta no mês da fatura", async () => {
    const m = (await (await como("a").request("/api/mes?mes=2026-11")).json()) as Mes;
    const mercado = m.categorias.find((c) => c.nome === "Mercado")!;
    expect(mercado).toMatchObject({ previsto: "700.00", gasto: "130.00", ajustado: true });
    expect(m).toMatchObject({ previsto: "700.00", gasto: "130.00", livre: "570.00", renda: "4200.00" });
  });

  it("vigência: o padrão novo vale de dezembro em diante e outubro continua com o antigo", async () => {
    const dez = (await (await como("a").request("/api/mes?mes=2026-12")).json()) as Mes;
    const out = (await (await como("a").request("/api/mes?mes=2026-10")).json()) as Mes;
    expect(dez.categorias.find((c) => c.nome === "Mercado")).toMatchObject({ previsto: "800.00", gasto: "50.00" });
    expect(out.categorias.find((c) => c.nome === "Mercado")).toMatchObject({ previsto: "600.00", gasto: "600.00", estado: "perto" });
  });

  it("ajustar o previsto do mês e B não ajusta o previsto de A", async () => {
    expect((await como("b").request("/api/previsto", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoria_id: ids.mercado, mes: "2026-11", valor: "1,00" }) })).status).toBe(404);
    expect(((await (await como("b").request("/api/mes?mes=2026-11")).json()) as Mes).categorias).toEqual([]);
    expect((await como("a").request("/api/previsto", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoria_id: ids.mercado, mes: "2026-11", valor: "750,00" }) })).status).toBe(200);
    const m = (await (await como("a").request("/api/mes?mes=2026-11")).json()) as Mes;
    expect(m.previsto).toBe("750.00");
  });
});
