import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

// Troca entre contas próprias (Pix do PicPay para o Inter investir): no Lançar e na revisão do extrato.
const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }) });
const json = { "content-type": "application/json" };
const post = (p: string, url: string, corpo: object) => como(p).request(url, { method: "POST", headers: json, body: JSON.stringify(corpo) });
const pernas = async (descricao: string) => (await owner.query("select a.name as conta, t.amount::text as valor from transactions t join accounts a on a.id = t.account_id where t.description = $1 and t.kind = 'transfer' and a.user_id = $2 order by t.amount", [descricao, ids.u])).rows;

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  ids.u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [ids.u]);
  ids.inter = await q("insert into accounts (user_id, name, kind) values ($1, 'Inter', 'investment') returning id", [ids.u]);
  ids.reserva = await q("insert into accounts (user_id, name, kind) values ($1, 'Reserva', 'goal') returning id", [ids.u]);
});

afterAll(async () => {
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("transferir entre contas próprias", () => {
  it("Lançar grava duas pernas que somam zero; B não move dinheiro de A", async () => {
    const r = await post("a", "/api/transferir", { origem_id: ids.picpay, destino_id: ids.inter, valor: "980,00", data: "2026-11-05", descricao: "Aporte Inter" });
    expect(r.status).toBe(201);
    expect(await pernas("Aporte Inter")).toEqual([{ conta: "PicPay", valor: "-980.00" }, { conta: "Inter", valor: "980.00" }]);
    expect((await post("b", "/api/transferir", { origem_id: ids.picpay, destino_id: ids.inter, valor: "1,00", descricao: "Invasão" })).status).toBe(400);
  });

  it("recusa a mesma conta nos dois lados e cofrinho como destino", async () => {
    expect((await post("a", "/api/transferir", { origem_id: ids.picpay, destino_id: ids.picpay, valor: "1,00" })).status).toBe(400);
    expect((await post("a", "/api/transferir", { origem_id: ids.picpay, destino_id: ids.reserva, valor: "1,00" })).status).toBe(400);
  });

  it("extrato: a linha marcada como troca vira transferência, e a prévia seguinte já sugere", async () => {
    const linha = { data: "2026-11-06", descricao: "Pix enviado Pedro Inter", valor: "-500.00" };
    const r = await post("a", "/api/importar", { conta_id: ids.picpay, linhas: [{ ...linha, tipo: "transferir", outra_conta_id: ids.inter }] });
    expect(r.status).toBe(201);
    expect(await pernas(linha.descricao)).toEqual([{ conta: "PicPay", valor: "-500.00" }, { conta: "Inter", valor: "500.00" }]);
    const previa = (await (await post("a", "/api/importar/previa", { conta_id: ids.picpay, linhas: [{ ...linha, data: "2026-12-06" }] })).json()) as { linhas: { tipo: string; outra_conta_id: string | null }[] };
    expect(previa.linhas[0]).toMatchObject({ tipo: "transferir", outra_conta_id: ids.inter });
  });

  it("extrato: troca sem a outra conta é recusada e nada é gravado", async () => {
    const r = await post("a", "/api/importar", { conta_id: ids.picpay, linhas: [{ data: "2026-11-07", descricao: "Pix sem destino", valor: "-10.00", tipo: "transferir" }] });
    expect(r.status).toBe(400);
    expect(await pernas("Pix sem destino")).toEqual([]);
  });
});
