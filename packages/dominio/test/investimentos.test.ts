import { describe, expect, it } from "vitest";
import { ondeAportar, posicaoDe, projetar, valorDe } from "../src/investimentos.ts";

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
    expect(r.sugestoes.map((s) => [s.ticker, s.cotas])).toEqual([["DEMO11", 2], ["TESTE11", 4]]);
    expect(r.sugestoes.reduce((s, x) => s + x.valor, 0n) + r.sobra).toBe(50000n);
  });
});

describe("projeção", () => {
  it("sem rendimento, é só a soma dos aportes", () => {
    expect(projetar(100000n, 10000n, 0, 1)).toEqual([100000n, 220000n]);
  });
});
