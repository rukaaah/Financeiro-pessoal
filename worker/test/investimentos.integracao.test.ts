import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ticker = `T${sufixo.toUpperCase().replace(/[^A-Z0-9]/g, "X")}11`.slice(0, 12);
const ids: Record<string, string> = {};
let owner: pg.Client;
const banco = bancoPg(URL_APP);
const como = (p: string) => criarApp({ banco: () => banco, credenciais: async () => ({ email: email(p), emailVerificado: true }) });
type I = { total: string; custo: string; ativos: { ticker: string; quantidade: number; preco_medio: string; valor: string }[] };

beforeAll(async () => {
  owner = new pg.Client({ connectionString: URL_OWNER });
  await owner.connect();
  const q = async (sql: string, p: unknown[]) => (await owner.query(sql, p)).rows[0]?.id as string;
  const u = await q("insert into app_users (email, display_name) values ($1, 'A') returning id", [email("a")]);
  await q("insert into app_users (email, display_name) values ($1, 'B') returning id", [email("b")]);
  ids.picpay = await q("insert into accounts (user_id, name, kind) values ($1, 'PicPay', 'checking') returning id", [u]);
  ids.inter = await q("insert into accounts (user_id, name, kind) values ($1, 'Inter', 'investment') returning id", [u]);
});

afterAll(async () => {
  await owner.query("delete from asset_quotes where ticker = $1", [ticker]);
  await owner.query("delete from fii_documents where ticker = $1", [ticker]);
  await owner.query("delete from fii_insights where ticker = $1", [ticker]);
  await owner.query("delete from fii_reports where ticker = $1", [ticker]);
  await owner.query("delete from app_users where email like $1", [`%-${sufixo}@teste.dev`]);
  await owner.end();
  await banco.fechar();
});

describe("investimentos pelo Worker, como papel app", () => {
  it("duas compras dão o preço médio; a cotação do job dá o valor; compra é transferência", async () => {
    const comprar = (q: string, p: string) => como("a").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, nome: "Teste", classe: "brick", quantidade: q, preco: p, conta_id: ids.picpay, investimento_id: ids.inter, data: "2026-11-02" }) });
    expect((await comprar("10", "100,00")).status).toBe(201);
    expect((await comprar("10", "110,00")).status).toBe(201);
    let r = (await (await como("a").request("/api/investimentos")).json()) as I;
    expect(r.ativos[0]).toMatchObject({ ticker, quantidade: 20, preco_medio: "105.00", valor: "2100.00" });
    await owner.query("insert into asset_quotes (ticker, quoted_on, price, source) values ($1, current_date, 102.30, 'teste')", [ticker]);
    r = (await (await como("a").request("/api/investimentos")).json()) as I;
    expect([r.total, r.custo]).toEqual(["2046.00", "2100.00"]);
    const pernas = (await owner.query("select sum(amount)::text s, count(*)::int n from transactions where description = $1", [`Compra de ${ticker}`])).rows[0];
    expect(pernas).toEqual({ s: "0.00", n: 4 });
  });

  it("relatório usa o pregão anterior, a liquidez média e o informe da CVM; aporte inválido é recusado", async () => {
    await owner.query("insert into asset_quotes (ticker, quoted_on, price, liquidity, source) values ($1, current_date - 1, 110.00, 400000, 'b3'), ($1, current_date - 2, 100.00, 200000, 'b3')", [ticker]);
    await owner.query("insert into fii_reports (ticker, ref_month, cnpj, nav_per_share, dy_month) values ($1, date_trunc('month', current_date - 40)::date, '00.000.000/0001-00', 110.0, 0.008)", [ticker]);
    const r = (await (await como("a").request("/api/investimentos?aporte=300")).json()) as I & {
      ativos: { variacao_dia: number | null; liquidez: number | null; vp_cota: number | null }[];
      relatorio: { atualizado_em: string | null; alertas: { ticker: string }[] }; onde_aportar: { avisos: string[] };
    };
    expect(r.ativos[0]).toMatchObject({ variacao_dia: -7, liquidez: 300000, vp_cota: 110 });
    expect(r.relatorio.atualizado_em).not.toBeNull();
    expect(r.relatorio.alertas.some((a) => a.ticker === ticker)).toBe(true);
    expect(r.onde_aportar.avisos[0]).toMatch(/Sem meta por classe/);
    expect((await como("a").request("/api/investimentos?aporte=abc")).status).toBe(400);
  });

  it("notícias do FII: A vê resumo, datas e documentos do que tem; B não vê nada", async () => {
    await owner.query("insert into fii_documents (ticker, id, category, title, delivered_at, content) values ($1, 9001, 'Fato Relevante', 'Fato Relevante', now() - interval '1 day', 'texto'), ($1, 9002, 'Relatórios', 'Relatório Gerencial', now() - interval '3 days', '')", [ticker]);
    await owner.query(`insert into fii_insights (ticker, summary, prepare, events, documents, model)
                       values ($1, 'Nova emissão anunciada.', '["Decida até 28/11."]', '[{"tipo":"subscricao","data":"2026-11-28","texto":"Fim do direito de preferência","documento":9001}]', '{9001,9002}', 'teste')`, [ticker]);
    type N = { noticias: { ticker: string; resumo: string | null; preparar: string[]; eventos: { tipo: string }[]; documentos: { id: number; titulo: string }[] }[] };
    const r = (await (await como("a").request("/api/investimentos/noticias")).json()) as N;
    const n = r.noticias.find((x) => x.ticker === ticker)!;
    expect(n).toMatchObject({ resumo: "Nova emissão anunciada.", preparar: ["Decida até 28/11."] });
    expect(n.eventos[0]?.tipo).toBe("subscricao");
    expect(n.documentos.map((d) => d.id)).toEqual([9001, 9002]);
    expect(((await (await como("b").request("/api/investimentos/noticias")).json()) as N).noticias).toEqual([]);
  });

  it("B não vê a carteira de A nem compra na conta de A", async () => {
    expect(((await (await como("b").request("/api/investimentos")).json()) as I).ativos).toEqual([]);
    const r = await como("b").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, classe: "brick", quantidade: "1", preco: "1,00", conta_id: ids.picpay, investimento_id: ids.inter }) });
    expect(r.status).toBe(400);
  });
});
