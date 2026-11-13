import { describe, expect, it } from "vitest";
import { cotasSugeridas, diaUtilAnterior, ondeAportar, posicaoDe, projetar, relatorioDaCarteira, valorDe } from "../src/investimentos.ts";

describe("posição", () => {
  it("preço médio ponderado; venda não mexe no preço médio", () => {
    const p = posicaoDe([{ quantidade: "10", preco: "100.00" }, { quantidade: "10", preco: "110.00" }, { quantidade: "-5", preco: "120.00" }]);
    expect([p.quantidade6, p.precoMedio6, p.custo]).toEqual([15_000_000n, 105_000_000n, 157500n]);
    expect(valorDe(p, "102.30")).toBe(153450n);
  });
});

describe("onde aportar", () => {
  const ativos = [
    { ticker: "FICTA11", classe: "paper" as const, valor: 245250n, preco: "98.10", pvp: 1.03, liquidez: 900000 },
    { ticker: "DEMO11", classe: "paper" as const, valor: 38480n, preco: "9.62", pvp: 0.94, liquidez: 650000 },
    { ticker: "TESTE11", classe: "brick" as const, valor: 122760n, preco: "102.30", pvp: 0.88, liquidez: 720000 },
    { ticker: "MODEL11", classe: "infra" as const, valor: 275100n, preco: "91.70", pvp: 0.92, liquidez: 350000 },
  ];
  const regras = { maxPvp: 1, maxPeso: 40, minLiquidez: 500000, metas: { paper: 40, brick: 40, infra: 20 } };
  it("barra quem passa das regras, compra cota inteira e devolve a sobra", () => {
    const r = ondeAportar(ativos, regras, 50000n);
    expect(r.fora.map((f) => f.ticker)).toEqual(["FICTA11", "MODEL11"]);
    // 1ª passada: 2 DEMO11 e 4 TESTE11; a sobra (R$ 71,56) não paga um TESTE11 e compra mais 7 DEMO11.
    expect(r.sugestoes.map((s) => [s.ticker, s.cotas])).toEqual([["DEMO11", 9], ["TESTE11", 4]]);
    expect(r.sobra).toBe(422n);
    expect(r.sugestoes.reduce((s, x) => s + x.valor, 0n) + r.sobra).toBe(50000n);
  });
  it("sem ativo ou sem meta, explica por que não sugeriu nada", () => {
    expect(ondeAportar([], regras, 50000n).avisos[0]).toMatch(/Nenhum ativo/);
    const semMeta = ondeAportar(ativos, { ...regras, metas: {} }, 50000n);
    expect([semMeta.sugestoes.length, semMeta.sobra]).toEqual([0, 50000n]);
    expect(semMeta.avisos[0]).toMatch(/Sem meta por classe/);
  });
  it("aporte pequeno não vira só sobra: a parte de uma classe sem ativo vai para as outras", () => {
    const tesouroSemAtivo = { ...regras, metas: { paper: 40, brick: 35, treasury: 25 } };
    const r = ondeAportar(ativos, tesouroSemAtivo, 50000n);
    expect(r.sugestoes.length).toBeGreaterThan(0);
    expect(r.sobra < 962n).toBe(true); // menos que a cota mais barata elegível (DEMO11)
    expect(r.avisos.some((a) => a.startsWith("Tesouro"))).toBe(true);
  });
  it("classe abaixo da meta sem ativo elegível vira aviso, não some", () => {
    const r = ondeAportar(ativos, { ...regras, metas: { ...regras.metas, logistics: 10 } }, 50000n);
    expect(r.avisos.some((a) => a.startsWith("Logística") && a.includes("não tem ativo dessa classe"))).toBe(true);
    expect(r.sugestoes.reduce((s, x) => s + x.valor, 0n) + r.sobra).toBe(50000n);
  });
});

describe("projeção", () => {
  it("sem rendimento, é só a soma dos aportes", () => {
    expect(projetar(100000n, 10000n, 0, 1)).toEqual([100000n, 220000n]);
  });
});

describe("relatório da carteira", () => {
  const regras = { maxPvp: 1, maxPeso: 40, minLiquidez: 500000, metas: {} };
  const base = { classe: "paper" as const, precoAnterior: 10, preco30d: 10, liquidez: 900000, cotadoEm: "2026-11-04" };
  it("renda estimada pelo DY e alertas pelas regras", () => {
    const r = relatorioDaCarteira([
      { ...base, ticker: "BARAT11", valor: 120000n, preco: 10, pvp: 0.85, dy: 12 },
      { ...base, ticker: "CARO11", valor: 60000n, preco: 9.6, pvp: 1.08, dy: null, liquidez: 200000 },
      { ...base, ticker: "QUEDA11", valor: 0n, preco: 9, preco30d: 10, pvp: 0.95, dy: null },
    ], regras, "2026-11-05");
    expect(r.rendaMensal).toBe(1200n); // R$ 1.200 x 12% / 12
    expect(r.alertas.map((a) => [a.ticker, a.tipo])).toEqual([
      ["BARAT11", "oportunidade"], ["CARO11", "atencao"], ["CARO11", "atencao"], ["CARO11", "atencao"], ["QUEDA11", "atencao"], ["QUEDA11", "atencao"],
    ]);
    expect(r.desatualizado).toBeNull();
  });
  it("avisa quando a cotação mais nova é de antes do dia útil anterior", () => {
    expect(diaUtilAnterior("2026-11-09")).toBe("2026-11-06"); // segunda → sexta
    expect(relatorioDaCarteira([{ ...base, ticker: "VELHO11", valor: 1n, preco: 10, pvp: null, dy: null, cotadoEm: "2026-11-02" }], regras, "2026-11-05").desatualizado).toBe("2026-11-02");
  });
});

describe("cotas sugeridas no momento de compra", () => {
  const regras = { maxPvp: 1, maxPeso: 20 };
  it("cotas inteiras que o aporte paga", () => {
    expect(cotasSugeridas("98.500000", 100_000n, 0n, 1_000_000n, regras, 0.9)).toEqual({ cotas: 10, valor: 98_500n, limite: null });
  });
  it("respeita o peso máximo por ativo", () => {
    // carteira de R$ 10.000 com R$ 1.900 no fundo; aporte de R$ 1.000: teto 20% de 11.000 = 2.200, sobra 300
    const r = cotasSugeridas("100.000000", 100_000n, 190_000n, 1_000_000n, regras, 0.9);
    expect(r.cotas).toBe(3);
    expect(r.limite).toMatch(/peso máximo de 20,0%/);
  });
  it("P/VP acima do máximo do usuário não sugere cota", () => {
    const r = cotasSugeridas("100.000000", 100_000n, 0n, 1_000_000n, regras, 1.08);
    expect(r).toMatchObject({ cotas: 0, limite: "P/VP 1,08 acima do seu máximo (1,00)" });
  });
});
