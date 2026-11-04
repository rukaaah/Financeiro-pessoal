import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ticker = `T${sufixo.toUpperCase().replace(/[^A-Z0-9]/g, "X")}11`.slice(0, 12);
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }) });
type I = { total: string; custo: string; ativos: { ticker: string; quantidade: number; preco_medio: string; valor: string }[] };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.inter = await q("insert into accounts (user_id, name, kind) values ($1, 'Inter', 'investment') returning id", [u]);
});

afterAll(async () => {
  await owner.query("delete from asset_quotes where ticker = $1", [ticker]);
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("investimentos pelo Worker, como papel app", () => {
  it("duas compras dão o preço médio; a cotação do job dá o valor; compra é transferência", async () => {
    const comprar = (q: string, p: string) => como("a").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, nome: "Teste", classe: "brick", quantidade: q, preco: p, conta_id: ids.picpay, investimento_id: ids.inter, data: "2026-11-02" }) });
    expect((await comprar("10", "100,00")).status).toBe(201);
    expect((await comprar("10", "110,00")).status).toBe(201);
    let r = (await (await como("a").request("/api/investimentos")).json()) as I;
    expect(r.ativos[0]).toMatchObject({ ticker, quantidade: 20, preco_medio: "105.00", valor: "2100.00" });
    await owner.query("insert into asset_quotes (ticker, quoted_on, price, source) values ($1, current_date, 102.30, 'teste')", [ticker]);
    r = (await (await como("a").request("/api/investimentos")).json()) as I;
    expect([r.total, r.custo]).toEqual(["2046.00", "2100.00"]);
    const pernas = (await owner.query("select sum(amount)::text s, count(*)::int n from transactions where description = $1", [`Compra de ${ticker}`])).rows[0];
    expect(pernas).toEqual({ s: "0.00", n: 4 });
  });

  it("B não vê a carteira de A nem compra na conta de A", async () => {
    expect(((await (await como("b").request("/api/investimentos")).json()) as I).ativos).toEqual([]);
    const r = await como("b").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, classe: "brick", quantidade: "1", preco: "1,00", conta_id: ids.picpay, investimento_id: ids.inter }) });
    expect(r.status).toBe(400);
  });
});
