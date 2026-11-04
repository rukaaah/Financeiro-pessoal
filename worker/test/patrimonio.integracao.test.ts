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
const post = (p: string, rota: string, corpo: object) => como(p).request(rota, { method: "POST", headers: json, body: JSON.stringify(corpo) });
type P = { patrimonio: string; partes: Record<string, string>; a_receber: string; cofrinhos: { id: string; saldo: string; a_devolver: string }[] };
const ver = async (p: string) => (await (await como(p).request("/api/patrimonio")).json()) as P;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  const g = await q("insert into category_groups (user_id, name) values ($1, 'R') returning id", [u]);
  const k = await q("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Salário', 'income') returning id", [u, g]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.reserva = await q("insert into accounts (user_id, name, kind) values ($1, 'Reserva', 'goal') returning id", [u]);
  await owner.query("insert into transactions (user_id, kind, account_id, category_id, amount, occurred_on) values ($1, 'income', $2, $3, 1000, '2026-01-05')", [u, ids.picpay, k]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("patrimônio e cofrinhos pelo Worker, como papel app", () => {
  it("guardar move dinheiro sem mudar o patrimônio; empréstimo fica a devolver até a devolução", async () => {
    expect((await ver("a")).patrimonio).toBe("1000.00");
    expect((await post("a", "/api/guardar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "300,00", data: "2026-01-06" })).status).toBe(201);
    expect((await post("a", "/api/resgatar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "100,00", data: "2026-01-07", finalidade: "loan" })).status).toBe(201);
    let p = await ver("a");
    expect([p.patrimonio, p.partes.contas, p.partes.cofrinhos, p.cofrinhos[0]!.a_devolver]).toEqual(["1000.00", "800.00", "200.00", "100.00"]);
    await post("a", "/api/guardar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "60,00", data: "2026-01-08", devolucao: true });
    await post("a", "/api/guardar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "50,00", data: "2026-01-08" });
    p = await ver("a");
    expect([p.cofrinhos[0]!.saldo, p.cofrinhos[0]!.a_devolver]).toEqual(["310.00", "40.00"]);
  });

  it("resgate sem finalidade é recusado; conciliação aponta a diferença", async () => {
    expect((await post("a", "/api/resgatar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "1,00" })).status).toBe(400);
    const r = (await (await post("a", "/api/conciliar", { conta_id: ids.picpay, saldo_banco: "700,00" })).json()) as { diferenca: string };
    expect(r.diferenca).toBe("10.00");
  });

  it("B não guarda no cofrinho de A nem vê o patrimônio de A", async () => {
    expect((await post("b", "/api/guardar", { conta_id: ids.picpay, cofrinho_id: ids.reserva, valor: "1,00" })).status).toBe(400);
    expect((await ver("b")).patrimonio).toBe("0.00");
  });
});
