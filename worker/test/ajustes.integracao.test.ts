import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }) });
const json = { "content-type": "application/json" };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  await owner.query("insert into app_users (email, display_name, is_admin) values ($1, 'Admin', true), ($2, 'Comum', false)", [email("admin"), email("comum")]);
});

afterAll(async () => {
  await owner.query("delete from access_log where target like $1", [`%-${sufixo}@teste.dev`]);
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("acesso (RF19): a regra vale no banco, não na tela", () => {
  it("só quem administra adiciona, desativa e reativa; tudo fica no registro", async () => {
    expect((await como("comum").request("/api/acesso", { method: "POST", headers: json, body: JSON.stringify({ email: email("nova"), nome: "Nova" }) })).status).toBe(403);
    expect((await como("comum").request("/api/acesso")).status).toBe(403);
    expect((await como("admin").request("/api/acesso", { method: "POST", headers: json, body: JSON.stringify({ email: email("nova"), nome: "Nova" }) })).status).toBe(201);
    const { pessoas } = (await (await como("admin").request("/api/acesso")).json()) as { pessoas: { id: string; email: string }[] };
    const nova = pessoas.find((p) => p.email === email("nova"))!;
    expect((await como("admin").request(`/api/acesso/${nova.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ ativa: false }) })).status).toBe(200);
    expect((await (await como("nova").request("/api/sessao")).json()) as { modo: string }).toMatchObject({ modo: "demo" });
    const acoes = (await owner.query("select action from access_log where target = $1 order by created_at", [email("nova")])).rows.map((r) => r.action);
    expect(acoes).toEqual(["adicionou", "desativou"]);
  });

  it("conta nova e prazos do cartão com vigência; categoria arquivada some das opções", async () => {
    const conta = (await (await como("comum").request("/api/contas", { method: "POST", headers: json, body: JSON.stringify({ nome: "Unicred", tipo: "credit_card" }) })).json()) as { id: string };
    expect((await como("comum").request(`/api/cartoes/${conta.id}/prazos`, { method: "POST", headers: json, body: JSON.stringify({ fechamento: 4, vencimento: 11, desde: "2026-01-01" }) })).status).toBe(201);
    expect((await como("comum").request(`/api/cartoes/${conta.id}/prazos`, { method: "POST", headers: json, body: JSON.stringify({ fechamento: 5, vencimento: 12, desde: "2026-06-01" }) })).status).toBe(201);
    const vig = (await owner.query("select closing_day, lower(vigencia)::text d, upper(vigencia)::text f from account_terms where account_id = $1 order by lower(vigencia)", [conta.id])).rows;
    expect(vig).toEqual([{ closing_day: 4, d: "2026-01-01", f: "2026-06-01" }, { closing_day: 5, d: "2026-06-01", f: null }]);
    const cat = (await (await como("comum").request("/api/categorias", { method: "POST", headers: json, body: JSON.stringify({ nome: "Mercado", grupo: "Alimentação", tipo: "expense", previsto: "600,00" }) })).json()) as { id: string };
    await como("comum").request(`/api/categorias/${cat.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ ativa: false }) });
    const op = (await (await como("comum").request("/api/opcoes")).json()) as { categorias: unknown[] };
    expect(op.categorias).toEqual([]);
  });
});
