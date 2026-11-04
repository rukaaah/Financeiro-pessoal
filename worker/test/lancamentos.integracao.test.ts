import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (email: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email, emailVerificado: true }) });
const json = { "content-type": "application/json" };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  await owner.query("alter role app login password 'dev'");
  for (const p of ["a", "b"]) {
    const u = (await owner.query("insert into app_users (email, display_name) values ($1, $2) returning id", [`${p}-${sufixo}@teste.dev`, p])).rows[0].id;
    const g = (await owner.query("insert into category_groups (user_id, name) values ($1, 'Alimentação') returning id", [u])).rows[0].id;
    ids[`cat_${p}`] = (await owner.query("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Mercado', 'expense') returning id", [u, g])).rows[0].id;
    ids[`rec_${p}`] = (await owner.query("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Salário', 'income') returning id", [u, g])).rows[0].id;
    ids[`conta_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u])).rows[0].id;
  }
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("lançar e editar, como papel app", () => {
  it("gastei vira despesa negativa, aparece na lista e entra no total pela data", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const r = await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "42,50", conta_id: ids.conta_a, categoria_id: ids.cat_a, data: "2026-11-03", descricao: "Lanche" }) });
    expect(r.status).toBe(201);
    const lista = (await (await a.request("/api/lancamentos?mes=2026-11")).json()) as { lancamentos: { descricao: string; valor: string }[]; saiu: string };
    expect(lista.lancamentos).toEqual([expect.objectContaining({ descricao: "Lanche", valor: "-42.50" })]);
    expect(lista.saiu).toBe("42.50");
  });

  it("recusa despesa em categoria de receita e valor com três casas", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const r1 = await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "10", conta_id: ids.conta_a, categoria_id: ids.rec_a, data: "2026-11-03" }) });
    expect(r1.status).toBe(400);
    const r2 = await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "10,555", conta_id: ids.conta_a, categoria_id: ids.cat_a, data: "2026-11-03" }) });
    expect(r2.status).toBe(400);
  });

  it("B não lança na conta de A, não vê, não edita e não exclui o lançamento de A", async () => {
    const a = como(`a-${sufixo}@teste.dev`), b = como(`b-${sufixo}@teste.dev`);
    const { ids: [id] } = (await (await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "recebi", valor: "4.200,00", conta_id: ids.conta_a, categoria_id: ids.rec_a, data: "2026-11-01" }) })).json()) as { ids: string[] };
    expect((await b.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "1", conta_id: ids.conta_a, categoria_id: ids.cat_b, data: "2026-11-01" }) })).status).toBe(400);
    expect(((await (await b.request("/api/lancamentos?mes=2026-11")).json()) as { lancamentos: unknown[] }).lancamentos).toEqual([]);
    expect((await b.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ descricao: "x" }) })).status).toBe(404);
    expect((await b.request(`/api/lancamentos/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ valor: "4.300,00" }) })).status).toBe(200);
    const lista = (await (await a.request("/api/lancamentos?mes=2026-11")).json()) as { entrou: string };
    expect(lista.entrou).toBe("4300.00");
    expect((await a.request(`/api/lancamentos/${id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("compra parcelada grava as parcelas que somam o total e sai inteira ao excluir", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const { ids: criados } = (await (await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "100,00", conta_id: ids.conta_a, categoria_id: ids.cat_a, data: "2026-11-02", parcelas: 3 }) })).json()) as { ids: string[] };
    expect(criados).toHaveLength(3);
    const soma = (await owner.query("select sum(amount)::text as s from transactions where id = any($1::uuid[])", [criados])).rows[0].s;
    expect(soma).toBe("-100.00");
    expect(((await (await a.request(`/api/lancamentos/${criados[1]}`, { method: "DELETE" })).json()) as { excluidos: number }).excluidos).toBe(3);
  });
});
