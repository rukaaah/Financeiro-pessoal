import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { hojeEmSaoPaulo } from "../src/contexto.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }), ptax: async () => "5.47780" });
const json = { "content-type": "application/json" };
const hoje = hojeEmSaoPaulo(), mes = hoje.slice(0, 7);
type Mes = { a_pagar: string; gasto: string; contas: { id: string; paga: boolean }[]; atencao: { chave: string }[]; entradas: { id: string; estimativa: string }[]; projecao: unknown[] };
const mesDe = async (p: string) => (await (await como(p).request(`/api/mes?mes=${mes}`)).json()) as Mes;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'Casa') returning id", [u]);
  ids.casa = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Moradia', 'expense') returning id", [u, g]);
  ids.renda = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Freelance', 'income') returning id", [u, g]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("contas recorrentes, entradas previstas e Atenção, como papel app", () => {
  it("conta recorrente entra em a pagar; paga pela Atenção sai de a pagar e entra no gasto, nunca nos dois", async () => {
    const r = await como("a").request("/api/contas-recorrentes", { method: "POST", headers: json, body: JSON.stringify({ nome: "Conta de luz", valor: "120,00", dia: 28, categoria_id: ids.casa, conta_id: ids.picpay, urgencia: "essential" }) });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    let m = await mesDe("a");
    expect([m.a_pagar, m.gasto]).toEqual(["120.00", "0.00"]);
    expect(m.atencao.map((i) => i.chave)).toContain(`conta:${id}:${mes}`);
    await como("a").request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "118,40", conta_id: ids.picpay, categoria_id: ids.casa, data: hoje, conta_recorrente_id: id }) });
    m = await mesDe("a");
    expect([m.a_pagar, m.gasto, m.contas[0]!.paga]).toEqual(["0.00", "118.40", true]);
  });

  it("freelance em dólar: estimativa pela PTAX e, ao receber, o desconto do PayPal guardado", async () => {
    const r = await como("a").request("/api/entradas-previstas", { method: "POST", headers: json, body: JSON.stringify({ descricao: "Freelance", moeda: "USD", valor: "300,00", data: hoje, conta_id: ids.picpay, categoria_id: ids.renda }) });
    const { id } = (await r.json()) as { id: string };
    expect((await mesDe("a")).entradas.find((e) => e.id === id)?.estimativa).toBe("1643.34");
    const rec = (await (await como("a").request(`/api/entradas-previstas/${id}/receber`, { method: "POST", headers: json, body: JSON.stringify({ recebido: "1.587,49", data: hoje }) })).json()) as { desconto: string };
    expect(rec.desconto).toBe("55.85");
    const m = await mesDe("a");
    expect(m.entradas.find((e) => e.id === id)).toBeUndefined();
  });

  it("lembrar amanhã esconde o item; B não vê as contas nem as entradas de A", async () => {
    const r = await como("a").request("/api/contas-recorrentes", { method: "POST", headers: json, body: JSON.stringify({ nome: "Internet", valor: "100,00", dia: 30, categoria_id: ids.casa, conta_id: ids.picpay }) });
    const { id } = (await r.json()) as { id: string };
    const chave = `conta:${id}:${mes}`;
    await como("a").request("/api/atencao/adiar", { method: "POST", headers: json, body: JSON.stringify({ chave, ate: "2999-01-01" }) });
    expect((await mesDe("a")).atencao.map((i) => i.chave)).not.toContain(chave);
    const b = await mesDe("b");
    expect([b.contas, b.entradas, b.a_pagar]).toEqual([[], [], "0.00"]);
  });
});
