import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { credenciaisDoPedido, criarCookieSessao } from "../src/auth.ts";
import { bancoPg } from "./banco-pg.ts";

/**
 * O teste que decide a fatia 0 (ADR-015): pelo próprio Worker, conectado como o papel
 * `app` (sem BYPASSRLS), cada sessão só enxerga as próprias contas.
 * Precisa do Postgres do docker-compose com as migrations aplicadas.
 */
const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const emails = { a: `a-${sufixo}@teste.dev`, b: `b-${sufixo}@teste.dev`, inativo: `x-${sufixo}@teste.dev` };
let owner: pg.Client;
let demoTinhaContas = 0;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  await owner.query("begin");
  const ins = async (email: string, nome: string, ativo = true) =>
    (await owner.query("insert into app_users (email, display_name, active) values ($1, $2, $3) returning id", [email, nome, ativo])).rows[0].id as string;
  const a = await ins(emails.a, "Pessoa A"), b = await ins(emails.b, "Pessoa B"), x = await ins(emails.inativo, "Inativa", false);
  for (const [id, n] of [[a, 2], [b, 5], [x, 7]] as const)
    for (let i = 0; i < n; i++) await owner.query("insert into accounts (user_id, name, kind) values ($1, $2, 'checking')", [id, `Conta ${i}`]);
  const demo = await owner.query("select id from app_users where is_demo and active limit 1");
  if (demo.rowCount === 0) await owner.query("insert into app_users (email, display_name, is_demo) values ($1, 'Visitante', true)", [`demo-${sufixo}@teste.dev`]);
  else demoTinhaContas = (await owner.query("select count(*)::int as n from accounts where user_id = $1", [demo.rows[0].id])).rows[0].n;
  await owner.query("commit");
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
});

function app(email: string | null, verificado = true) {
  const banco = bancoPg(URL_APP);
  return { banco, app: criarApp({ banco: () => banco, credenciais: async () => (email ? { email, emailVerificado: verificado } : null) }) };
}

async function saude(email: string | null, verificado = true) {
  const { banco, app: a } = app(email, verificado);
  try {
    return (await (await a.request("/api/saude")).json()) as { modo: string; contas: number; nome: string; papel: string };
  } finally {
    await banco.fechar();
  }
}

describe("isolamento entre usuários pelo Worker, como papel app", () => {
  it("cada pessoa da allowlist vê só as próprias contas", async () => {
    expect(await saude(emails.a)).toMatchObject({ modo: "dono", contas: 2, papel: "app" });
    expect(await saude(emails.b)).toMatchObject({ modo: "dono", contas: 5 });
  });

  it("fora da allowlist, não verificado e inativo caem no demo e não veem nada de ninguém", async () => {
    for (const r of [await saude("estranho@teste.dev"), await saude(emails.a, false), await saude(emails.inativo), await saude(null)]) {
      expect(r.modo).toBe("demo");
      expect(r.contas).toBe(demoTinhaContas);
    }
  });

  it("o papel app sem contexto não lê linha nenhuma", async () => {
    const banco = bancoPg(URL_APP);
    try {
      const [linhas] = await banco.lote([{ texto: "select count(*)::int as n from accounts", params: [] }]);
      expect(linhas![0]!.n).toBe(0);
    } finally {
      await banco.fechar();
    }
  });

  it("pelo cookie de sessão de verdade: A entra como dono e vê só as dela; cookie forjado cai no demo", async () => {
    const SEGREDO = "segredo-de-integracao-com-mais-de-32-bytes";
    const banco = bancoPg(URL_APP);
    const a = criarApp({ banco: () => banco, credenciais: (req) => credenciaisDoPedido(req, SEGREDO) });
    try {
      const cookie = (await criarCookieSessao(emails.a, SEGREDO)).split(";")[0]!;
      expect(await (await a.request("/api/saude", { headers: { cookie } })).json()).toMatchObject({ modo: "dono", contas: 2 });
      const forjado = (await criarCookieSessao(emails.a, "outro-segredo-qualquer-com-32-bytes!!")).split(";")[0]!;
      expect(await (await a.request("/api/saude", { headers: { cookie: forjado } })).json()).toMatchObject({ modo: "demo", contas: demoTinhaContas });
    } finally {
      await banco.fechar();
    }
  });
});
