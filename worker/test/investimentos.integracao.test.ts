import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { bancoPg } from "./banco-pg.ts";

const URL_OWNER = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
const URL_APP = URL_OWNER.replace(/\/\/[^@]+@/, "//app:dev@");
const sufixo = Math.random().toString(36).slice(2, 8);
const email = (p: string) => `${p}-${sufixo}@teste.dev`;
const ticker = `T${sufixo.toUpperCase().replace(/[^A-Z0-9]/g, "X")}11`.slice(0, 12);
const fii = `Q${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}11`;
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
  await owner.query("delete from fii_management where ticker = $1", [ticker]);
  await owner.query("delete from fii_reports where ticker = any($1)", [[ticker, fii]]);
  await owner.query("delete from fii_profiles where ticker = $1", [fii]);
  await owner.query("delete from asset_quotes where ticker = $1", [fii]);
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
    await owner.query(`insert into fii_management (ticker, management, documents, model)
                       values ($1, '{"postura":"Adiou a venda.","planos":[],"mudancas":[{"tema":"Venda","antes":"2026","agora":"2027","documento_antes":9002,"documento_agora":9001,"trecho":"adiada para 2027"}]}', '{9001,9002}', 'teste')`, [ticker]);
    type N = { noticias: { ticker: string; gestao: { postura: string } | null; gestao_datas: Record<string, string> | null; resumo: string | null; preparar: string[]; eventos: { tipo: string }[]; documentos: { id: number; titulo: string }[] }[] };
    const r = (await (await como("a").request("/api/investimentos/noticias")).json()) as N;
    const n = r.noticias.find((x) => x.ticker === ticker)!;
    expect(n).toMatchObject({ resumo: "Nova emissão anunciada.", preparar: ["Decida até 28/11."] });
    expect(n.eventos[0]?.tipo).toBe("subscricao");
    expect(n.documentos.map((d) => d.id)).toEqual([9001, 9002]);
    expect(n.gestao?.postura).toBe("Adiou a venda.");
    expect(Object.keys(n.gestao_datas ?? {}).sort()).toEqual(["9001", "9002"]);
    expect(((await (await como("b").request("/api/investimentos/noticias")).json()) as N).noticias).toEqual([]);
  });

  it("B não vê a carteira de A nem compra na conta de A", async () => {
    expect(((await (await como("b").request("/api/investimentos")).json()) as I).ativos).toEqual([]);
    const r = await como("b").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, classe: "brick", quantidade: "1", preco: "1,00", conta_id: ids.picpay, investimento_id: ids.inter }) });
    expect(r.status).toBe(400);
  });
});

describe("rendimento por campo e ficha do fundo", () => {
  type R = { valorizacao: number | null; proventos: number | null; total: number | null; proventos_valor: string };
  it("proventos estimados pelo informe da CVM entram no rendimento do ativo, da classe e da carteira", async () => {
    // Compra em janeiro; informes de dez a mar: rendimento por cota = DY do mês × VP do mês anterior.
    await owner.query(`insert into fii_reports (ticker, ref_month, cnpj, nav_per_share, dy_month, shares_outstanding, shareholders, net_assets) values
      ($1, '2026-01-01', '11.111.111/0001-11', 100, 0.01, 1000, 50, 100000), ($1, '2026-02-01', '11.111.111/0001-11', 100, 0.01, 1000, 60, 100000),
      ($1, '2026-03-01', '11.111.111/0001-11', 100, 0.009, 1500, 80, 150000)`, [fii]);
    await owner.query("insert into fii_profiles (ticker, cnpj, name, started_on, segment) values ($1, '11.111.111/0001-11', 'FUNDO FICTÍCIO', '2015-03-02', 'Logística')", [fii]);
    await owner.query("insert into asset_quotes (ticker, quoted_on, price, pvp, dy_12m, source) values ($1, current_date, 95.00, 0.95, 11.5, 'teste')", [fii]);
    const r = await como("a").request("/api/comprar-ativo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: fii, nome: "Fictício", classe: "logistics", quantidade: "10", preco: "100,00", conta_id: ids.picpay, investimento_id: ids.inter, data: "2026-01-15" }) });
    expect(r.status).toBe(201);
    const d = (await (await como("a").request("/api/investimentos")).json()) as { ativos: { ticker: string; rendimento: R; proventos_desde: string }[]; classes: { classe: string; rendimento: R }[]; rendimento: R };
    const a = d.ativos.find((x) => x.ticker === fii)!;
    // fev: 10 × 1,00 + mar: 10 × 0,90 = R$ 19,00 sobre custo de R$ 1.000; cota −5%.
    expect(a.rendimento).toEqual({ valorizacao: -5, proventos: 1.9, total: -3.1, proventos_valor: "19.00" });
    expect(a.proventos_desde).toBe("2026-02");
    expect(d.classes.find((k) => k.classe === "logistics")!.rendimento.total).toBe(-3.1);
    expect(d.rendimento.proventos_valor).toBe("19.00");
  });

  it("ficha traz perfil, histórico com emissão e o que a pessoa acompanha; B não vê o de A", async () => {
    type F = { perfil: { nome: string; inicio: string } | null; cotacao: { pvp: number } | null; historico: { mes: string; cotistas: number }[]; emissoes: { mes: string; novas: number }[]; em_carteira: boolean; acompanhando: boolean };
    const f = (await (await como("a").request(`/api/investimentos/fundo/${fii}`)).json()) as F;
    expect(f.perfil).toMatchObject({ nome: "FUNDO FICTÍCIO", inicio: "2015-03-02" });
    expect(f.cotacao?.pvp).toBe(0.95);
    expect(f.historico.map((h) => h.cotistas)).toEqual([50, 60, 80]);
    expect(f.emissoes).toEqual([{ mes: "2026-03", novas: 500 }]);
    expect([f.em_carteira, f.acompanhando]).toEqual([true, false]);
    expect((await como("a").request("/api/investimentos/fundo/abc")).status).toBe(400);

    const acompanhar = (p: string, t: string) => como(p).request("/api/investimentos/acompanhar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: t }) });
    expect((await acompanhar("a", "QQQQ11")).status).toBe(201);
    expect((await acompanhar("a", "x")).status).toBe(400);
    const g = (await (await como("a").request("/api/investimentos/fundo/QQQQ11")).json()) as F;
    expect([g.perfil, g.acompanhando, g.em_carteira]).toEqual([null, true, false]);
    const b = (await (await como("b").request("/api/investimentos/fundo/QQQQ11")).json()) as F;
    expect(b.acompanhando).toBe(false);
    const jobs = (await owner.query("select array_agg(t) as t from tickers_em_carteira() t")).rows[0].t as string[];
    expect(jobs).toContain("QQQQ11");
    expect((await como("a").request("/api/investimentos/acompanhar/QQQQ11", { method: "DELETE" })).status).toBe(200);
    expect(((await (await como("a").request("/api/investimentos/fundo/QQQQ11")).json()) as F).acompanhando).toBe(false);
  });
});
