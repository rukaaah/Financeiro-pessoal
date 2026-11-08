import { describe, expect, it } from "vitest";
import { formatar } from "../src/dinheiro.ts";
import { estadoDe, type LinhaDeCategoria, posicaoDoMes } from "../src/orcamento.ts";

const l = (nome: string, previsto: string, realizado: string, media3m = "0.00", tipo: "expense" | "income" = "expense"): LinhaDeCategoria =>
  ({ id: nome, nome, tipo, grupo: "G", previsto, ajustado: false, realizado, media3m });

const linhas = [
  l("Mercado", "600.00", "541.50", "520.00"),
  l("Restaurantes", "150.00", "165.00", "140.00"),
  l("Contas da casa", "475.00", "0.00"),
  l("Salário", "4200.00", "4200.00", "4200.00", "income"),
];

describe("posição do mês", () => {
  const p = posicaoDoMes(linhas, { mes: "2026-11", hoje: "2026-11-04", aPagar: 47500n, guardado: 130000n, formatar });

  it("os quatro números fecham: livre = previsto − gasto − a pagar", () => {
    expect([p.previsto, p.gasto, p.aPagar, p.livre]).toEqual([122500n, 70650n, 47500n, 4350n]);
    expect(p.previsto - p.gasto - p.aPagar).toBe(p.livre);
  });

  it("dias contados do jeito que a tela mostra: dia 4 de 30, 27 dias pela frente contando hoje", () => {
    expect([p.diaDoMes, p.diasNoMes, p.diasRestantes]).toEqual([4, 30, 27]);
    expect(p.porDia).toBe(4350n / 27n);
  });

  it("renda e sobra só com receitas; transferência não entra", () => {
    expect([p.renda, p.rendaPrevista, p.sobra]).toEqual([420000n, 420000n, 420000n - 70650n - 130000n]);
  });

  it("descoberta: a categoria mais acima do previsto, com a média de 3 meses", () => {
    expect(p.descoberta).toBe("Restaurantes passou R$ 15,00 do previsto e está R$ 25,00 acima da média de 3 meses.");
    expect(p.descobertaCategoria).toBe(p.categorias.find((c) => c.nome === "Restaurantes")?.id);
  });

  it("mês passado não tem dias pela frente; mês futuro tem o mês inteiro", () => {
    expect(posicaoDoMes(linhas, { mes: "2026-10", hoje: "2026-11-04", aPagar: 0n, guardado: 0n, formatar }).diasRestantes).toBe(0);
    expect(posicaoDoMes(linhas, { mes: "2026-12", hoje: "2026-11-04", aPagar: 0n, guardado: 0n, formatar }).diasRestantes).toBe(31);
  });
});

describe("estado da categoria", () => {
  it("perto a partir de 80%, fora acima do previsto, zero previsto com gasto é fora", () => {
    expect(estadoDe(7999n, 10000n)).toBe("dentro");
    expect(estadoDe(8000n, 10000n)).toBe("perto");
    expect(estadoDe(10000n, 10000n)).toBe("perto");
    expect(estadoDe(10001n, 10000n)).toBe("fora");
    expect(estadoDe(1n, 0n)).toBe("fora");
    expect(estadoDe(0n, 0n)).toBe("dentro");
  });
});
