import { CATEGORIAS_BASE, GRUPOS_BASE } from "@financeiro/dominio";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

/** Categorias base na primeira entrada, pelo Worker, como papel `app` e sob a RLS. */
const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string | null) => criarApp({ banco: () => banco, credenciais: async () => (p ? { email: email(p), emailVerificado: true } : null) });
const ids: Record<string, string> = {};

const categoriasDe = async (id: string) =>
  (await owner.query("select g.name as grupo, g.sort_order as ordem, k.name as nome, k.kind as tipo from categories k join category_groups g on g.id = k.group_id where k.user_id = $1 order by g.sort_order, k.name", [id])).rows;
const contaDemo = async () => Number((await owner.query("select count(*) as n from categories k join app_users u on u.id = k.user_id where u.is_demo")).rows[0].n);

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const ins = async (p: string) => (await owner.query("insert into app_users (email, display_name) values ($1, 'X') returning id", [email(p)])).rows[0].id as string;
  ids.nova = await ins("nova");
  ids.antiga = await ins("antiga");
  const g = (await owner.query("insert into category_groups (user_id, name) values ($1, 'Minhas') returning id", [ids.antiga])).rows[0].id;
  await owner.query("insert into categories (user_id, group_id, name, kind, active) values ($1, $2, 'Arquivada', 'expense', false)", [ids.antiga, g]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("categorias base", () => {
  it("conta real sem categoria ganha o conjunto base, uma vez só", async () => {
    await Promise.all([como("nova").request("/api/sessao"), como("nova").request("/api/sessao")]);
    await como("nova").request("/api/sessao");
    const cats = await categoriasDe(ids.nova!);
    expect(cats).toHaveLength(CATEGORIAS_BASE.length);
    const ordem = new Map(GRUPOS_BASE.map((g) => [g.nome, g.ordem]));
    for (const k of CATEGORIAS_BASE) expect(cats).toContainEqual({ grupo: k.grupo, ordem: ordem.get(k.grupo), nome: k.nome, tipo: k.tipo });
  });

  it("quem já tem categoria, mesmo arquivada, não ganha nada", async () => {
    await como("antiga").request("/api/sessao");
    expect((await categoriasDe(ids.antiga!)).map((k) => k.nome)).toEqual(["Arquivada"]);
  });

  it("o visitante do demo não escreve no demo", async () => {
    const antes = await contaDemo();
    await como(null).request("/api/sessao");
    expect(await contaDemo()).toBe(antes);
  });
});
