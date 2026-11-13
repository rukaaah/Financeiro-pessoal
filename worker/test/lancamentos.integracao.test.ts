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
  for (const p of ["a", "b"]) {
    const u = (await owner.query("insert into app_users (email, display_name) values ($1, $2) returning id", [`${p}-${sufixo}@teste.dev`, p])).rows[0].id;
    const g = (await owner.query("insert into category_groups (user_id, name) values ($1, 'Alimentação') returning id", [u])).rows[0].id;
    ids[`cat_${p}`] = (await owner.query("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Mercado', 'expense') returning id", [u, g])).rows[0].id;
    ids[`rec_${p}`] = (await owner.query("insert into categories (user_id, group_id, name, kind) values ($1, $2, 'Salário', 'income') returning id", [u, g])).rows[0].id;
    ids[`conta_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u])).rows[0].id;
    ids[`conta2_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'Inter', 'checking') returning id", [u])).rows[0].id;
    ids[`cartao_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'Unicred', 'credit_card') returning id", [u])).rows[0].id;
    await owner.query("insert into account_terms (user_id, account_id, vigencia, closing_day, due_day) values ($1, $2, '[2020-01-01,)', 4, 11)", [u, ids[`cartao_${p}`]]);
    ids[`cofre_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'Viagem', 'goal') returning id", [u])).rows[0].id;
    ids[`cofre2_${p}`] = (await owner.query("insert into accounts (user_id, name, kind) values ($1, 'Reserva', 'goal') returning id", [u])).rows[0].id;
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

  it("edita todos os campos de um gasto: tipo, categoria, conta, valor, data e descrição", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const { ids: [id] } = (await (await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "10,00", conta_id: ids.conta_a, categoria_id: ids.cat_a, data: "2026-10-03", descricao: "Errado" }) })).json()) as { ids: string[] };
    const r = await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ tipo: "income", categoria_id: ids.rec_a, conta_id: ids.conta2_a, valor: "12,34", data: "2026-10-05", descricao: "Certo" }) });
    expect(r.status).toBe(200);
    const l = (await owner.query("select kind::text, account_id, category_id, amount::text, occurred_on::text, description from transactions where id = $1", [id])).rows[0];
    expect(l).toEqual({ kind: "income", account_id: ids.conta2_a, category_id: ids.rec_a, amount: "12.34", occurred_on: "2026-10-05", description: "Certo" });
    // Categoria de outro tipo e receita no cartão são recusadas.
    expect((await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ categoria_id: ids.cat_a }) })).status).toBe(400);
    expect((await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ conta_id: ids.cartao_a }) })).status).toBe(400);
    // B não usa a categoria de A.
    const b = como(`b-${sufixo}@teste.dev`);
    expect((await b.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ categoria_id: ids.rec_a }) })).status).toBe(404);
  });

  it("gasto avulso vai para o cartão e recalcula a fatura pela data nova", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const { ids: [id] } = (await (await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "50,00", conta_id: ids.cartao_a, categoria_id: ids.cat_a, data: "2026-10-03" }) })).json()) as { ids: string[] };
    const fatura = async () => (await owner.query("select invoice_month::text as m from transactions where id = $1", [id])).rows[0].m;
    expect(await fatura()).toBe("2026-10-01");
    expect((await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ data: "2026-10-05" }) })).status).toBe(200);
    expect(await fatura()).toBe("2026-11-01");
    expect((await a.request(`/api/lancamentos/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ conta_id: ids.conta_a }) })).status).toBe(200);
    expect(await fatura()).toBeNull();
  });

  it("compra parcelada se edita inteira: valor total, número de parcelas, data e de volta à vista", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const { ids: criados } = (await (await a.request("/api/lancamentos", { method: "POST", headers: json, body: JSON.stringify({ intencao: "gastei", valor: "300,00", conta_id: ids.cartao_a, categoria_id: ids.cat_a, data: "2026-09-10", parcelas: 3, descricao: "TV" }) })).json()) as { ids: string[] };
    const grupo = (await owner.query("select installment_group_id as g from transactions where id = $1", [criados[0]])).rows[0].g;
    const parcelas = async () => (await owner.query(
      "select installment_no as n, installment_total as t, amount::text as v, invoice_month::text as m, description as d from transactions where installment_group_id = $1 order by installment_no", [grupo])).rows;
    expect((await a.request(`/api/lancamentos/${criados[2]}`, { method: "PATCH", headers: json, body: JSON.stringify({ parcelas: 4, valor: "400,01", descricao: "TV 55" }) })).status).toBe(200);
    expect(await parcelas()).toEqual([
      { n: 1, t: 4, v: "-100.01", m: "2026-10-01", d: "TV 55" }, { n: 2, t: 4, v: "-100.00", m: "2026-11-01", d: "TV 55" },
      { n: 3, t: 4, v: "-100.00", m: "2026-12-01", d: "TV 55" }, { n: 4, t: 4, v: "-100.00", m: "2027-01-01", d: "TV 55" },
    ]);
    // Lista e edição carregam o total da compra.
    const lista = (await (await a.request("/api/lancamentos?mes=2026-09")).json()) as { lancamentos: { descricao: string; valor_total: string | null }[] };
    expect(lista.lancamentos.find((x) => x.descricao === "TV 55")?.valor_total).toBe("-400.01");
    expect((await a.request(`/api/lancamentos/${criados[0]}`, { method: "PATCH", headers: json, body: JSON.stringify({ parcelas: 2, data: "2026-09-02" }) })).status).toBe(200);
    expect((await parcelas()).map((p) => [p.n, p.v, p.m])).toEqual([[1, "-200.01", "2026-09-01"], [2, "-200.00", "2026-10-01"]]);
    // Parcelas fora do cartão: recusado, nada muda.
    expect((await a.request(`/api/lancamentos/${criados[0]}`, { method: "PATCH", headers: json, body: JSON.stringify({ conta_id: ids.conta_a }) })).status).toBe(400);
    expect(await parcelas()).toHaveLength(2);
    expect((await a.request(`/api/lancamentos/${criados[0]}`, { method: "PATCH", headers: json, body: JSON.stringify({ parcelas: 1, conta_id: ids.conta_a }) })).status).toBe(200);
    const avulso = (await owner.query("select installment_no, installment_group_id, invoice_month, amount::text as v from transactions where id = $1", [criados[0]])).rows[0];
    expect(avulso).toEqual({ installment_no: null, installment_group_id: null, invoice_month: null, v: "-400.01" });
    expect(await parcelas()).toEqual([]);
  });

  it("transferência muda valor, data, descrição e contas nas duas pernas, só entre contas do mesmo tipo", async () => {
    const a = como(`a-${sufixo}@teste.dev`);
    const u = (await owner.query("select id from app_users where email = $1", [`a-${sufixo}@teste.dev`])).rows[0].id;
    const t = "00000000-0000-4000-8000-" + sufixo.padEnd(12, "0").replace(/[^0-9a-f]/g, "a");
    await owner.query(
      `insert into transactions (user_id, kind, account_id, amount, occurred_on, description, transfer_id) values
         ($1, 'transfer', $2, -100, '2026-08-01', 'Aporte', $4), ($1, 'transfer', $3, 100, '2026-08-01', 'Aporte', $4)`,
      [u, ids.conta_a, ids.cofre_a, t]);
    const saida = (await owner.query("select id from transactions where transfer_id = $1 and amount < 0", [t])).rows[0].id;
    const r = await a.request(`/api/lancamentos/${saida}`, { method: "PATCH", headers: json, body: JSON.stringify({ valor: "150,00", data: "2026-08-02", descricao: "Aporte viagem", conta_id: ids.conta2_a, conta_destino_id: ids.cofre2_a }) });
    expect(r.status).toBe(200);
    const pernas = (await owner.query("select account_id as c, amount::text as v, occurred_on::text as d, description as s from transactions where transfer_id = $1 order by amount", [t])).rows;
    expect(pernas).toEqual([{ c: ids.conta2_a, v: "-150.00", d: "2026-08-02", s: "Aporte viagem" }, { c: ids.cofre2_a, v: "150.00", d: "2026-08-02", s: "Aporte viagem" }]);
    // Trocar o cofrinho por uma conta corrente mudaria o sentido do lançamento: recusado.
    expect((await a.request(`/api/lancamentos/${saida}`, { method: "PATCH", headers: json, body: JSON.stringify({ conta_destino_id: ids.conta_a }) })).status).toBe(400);
    expect((await a.request(`/api/lancamentos/${saida}`, { method: "PATCH", headers: json, body: JSON.stringify({ conta_destino_id: ids.conta2_a }) })).status).toBe(400);
  });
});
