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

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'G') returning id", [u]);
  ids.apps = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Apps', 'expense') returning id", [u, g]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.mercado = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Mercado', 'expense') returning id", [u, g]);
  ids.reserva = await q("insert into accounts (user_id, name, kind) values ($1, 'Reserva', 'goal') returning id", [u]);
  await owner.query("insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on, description) values ($1, 'expense', $2, $3, -18.90, '2026-11-03', 'Uber')", [u, ids.picpay, ids.apps]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("importar extrato pelo Worker, como papel app", () => {
  const linhas = [{ data: "2026-11-03", descricao: "UBER", valor: "-18.90" }, { data: "2026-11-04", descricao: "Uber *Trip 0042", valor: "-22.10" }];
  it("prévia marca a duplicada e sugere a categoria pelo histórico", async () => {
    const r = (await (await como("a").request("/api/importar/previa", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas }) })).json()) as { linhas: { duplicada: boolean; categoria_id: string | null }[] };
    expect(r.linhas.map((l) => [l.duplicada, l.categoria_id])).toEqual([[true, ids.apps], [false, null]]);
  });
  it("importar grava tudo numa transação; B não importa na conta de A", async () => {
    const r = await como("a").request("/api/importar", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas: [{ ...linhas[1], categoria_id: ids.apps }] }) });
    expect(r.status).toBe(201);
    const b = await como("b").request("/api/importar", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas: [{ ...linhas[1], categoria_id: ids.apps }] }) });
    expect(b.status).toBe(400);
    const n = (await owner.query("select count(*)::int n from transactions where account_id = $1", [ids.picpay])).rows[0].n;
    expect(n).toBe(2);
  });
});

describe("extrato lido pela IA, com cofrinhos", () => {
  const comIA = (itens: object[]) => criarApp({
    banco: () => banco, credenciais: async () => ({ email: email("a"), emailVerificado: true }),
    ia: () => ({ run: async () => ({ response: JSON.stringify({ itens }) }) }),
  });
  const texto = "05/11/2026\nSUPERMERCADO NOVO - R$ 64,30\nGuardado no Cofrinho Viagem R$ 200,00\nResgate Cofrinho reserva R$ 50,00";

  it("a IA lê um formato novo e propõe categoria e cofrinho; a prévia acha o cofrinho existente", async () => {
    const app = comIA([
      { linha: 1, trecho_valor: "- R$ 64,30", trecho_data: "05/11/2026", descricao: "SUPERMERCADO NOVO", tipo: "gasto", categoria_id: ids.mercado },
      { linha: 2, trecho_valor: "R$ 200,00", trecho_data: "05/11/2026", descricao: "Guardado no Cofrinho Viagem", tipo: "guardar", cofrinho: "Viagem" },
      { linha: 3, trecho_valor: "R$ 50,00", trecho_data: "05/11/2026", descricao: "Resgate Cofrinho reserva", tipo: "resgatar", cofrinho: "reserva" },
    ]);
    const lido = (await (await app.request("/api/ia/extrato", { method: "POST", headers: json, body: JSON.stringify({ texto }) })).json()) as { linhas: object[] };
    expect(lido.linhas).toHaveLength(3);
    const previa = (await (await app.request("/api/importar/previa", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas: lido.linhas }) })).json()) as { linhas: Record<string, unknown>[] };
    expect(previa.linhas.map((l) => [l.tipo, l.categoria_id, l.cofrinho, l.cofrinho_id])).toEqual([
      ["gasto", ids.mercado, null, null],
      ["guardar", null, "Viagem", null],
      ["resgatar", null, "Reserva", ids.reserva],
    ]);

    const r = await app.request("/api/importar", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas: previa.linhas }) });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ importadas: 3, cofrinhos_criados: 1 });
    const viagem = (await owner.query("select a.id, coalesce(sum(t.amount), 0)::text as saldo from accounts a left join transactions t on t.account_id = a.id where a.name = 'Viagem' and a.kind = 'goal' group by a.id")).rows;
    expect(viagem).toEqual([{ id: expect.any(String), saldo: "200.00" }]);
    const resgate = (await owner.query("select amount::text as valor, goal_movement as fin from transactions where account_id = $1", [ids.reserva])).rows;
    expect(resgate).toEqual([{ valor: "-50.00", fin: "withdrawal" }]);
    const ia = (await owner.query("select count(*)::int as n from ai_calls a join app_users u on u.id = a.user_id where u.email = $1 and use_case = 'extrato'", [email("a")])).rows[0].n;
    expect(ia).toBe(1);
  });

  it("B não cria cofrinho nem mexe na conta de A", async () => {
    const b = await como("b").request("/api/importar", { method: "POST", headers: json, body: JSON.stringify({ conta_id: ids.picpay, linhas: [{ data: "2026-11-05", descricao: "Cofrinho X", valor: "-10.00", tipo: "guardar", cofrinho: "X" }] }) });
    expect(b.status).toBe(400);
    const n = (await owner.query("select count(*)::int as n from accounts where name = 'X'")).rows[0].n;
    expect(n).toBe(0);
  });
});
