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
const json = { "content-type": "application/json" };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  if ((await owner.query("select 1 from app_users where is_demo and active")).rowCount === 0)
    await owner.query("insert into app_users (email, display_name, is_demo) values ($1, 'Visitante', true)", [email("demo")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'G') returning id", [u]);
  ids.k = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Delivery', 'expense') returning id", [u, g]);
  const a = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  await owner.query("insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description) values ($1, 'expense', $2, $3, -312, '2026-11-03', 'iFood')", [u, a, ids.k]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

function modelo(respostas: object[]) {
  const chamadas: object[] = [];
  return { chamadas, ia: { run: async (_m: string, entrada: object) => { chamadas.push(entrada); return { response: JSON.stringify(respostas.shift()) }; } } };
}

describe("chat pela IA, como papel app", () => {
  it("demonstração nunca chama o modelo", async () => {
    const { chamadas, ia } = modelo([]);
    const app = criarApp({ banco: () => banco, credenciais: async () => null, ia: () => ia });
    const r = (await (await app.request("/api/chat", { method: "POST", headers: json, body: JSON.stringify({ pergunta: "Onde gastei mais?" }) })).json()) as { demo: boolean };
    expect(r.demo).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  it("planeja, executa sob RLS e só aceita números que estão nos resultados", async () => {
    const plano = { chamadas: [{ funcao: "gasto_por_categoria", args: { categorias: [ids.k], de: "2026-11", ate: "2026-11" } }] };
    const certo = modelo([plano, { resposta: "Delivery somou R$ 312,00 em novembro.", numeros_citados: ["312.00"] }]);
    const app = criarApp({ banco: () => banco, credenciais: async () => ({ email: email("a"), emailVerificado: true }), ia: () => certo.ia });
    const r = (await (await app.request("/api/chat", { method: "POST", headers: json, body: JSON.stringify({ pergunta: "quanto gastei com delivery?", mes: "2026-11" }) })).json()) as { resposta: string };
    expect(r.resposta).toBe("Delivery somou R$ 312,00 em novembro.");
    const inventado = modelo([plano, { resposta: "Delivery somou R$ 999,00.", numeros_citados: ["999.00"] }]);
    const app2 = criarApp({ banco: () => banco, credenciais: async () => ({ email: email("a"), emailVerificado: true }), ia: () => inventado.ia });
    const r2 = (await (await app2.request("/api/chat", { method: "POST", headers: json, body: JSON.stringify({ pergunta: "quanto gastei com delivery?", mes: "2026-11" }) })).json()) as { resposta: string };
    expect(r2.resposta).toMatch(/números que não estão nos seus dados/);
    const reg = (await owner.query("select accepted from ai_calls a join app_users u on u.id = a.user_id where u.email = $1 order by a.created_at", [email("a")])).rows.map((x) => x.accepted);
    expect(reg).toEqual([true, false]);
  });
});
