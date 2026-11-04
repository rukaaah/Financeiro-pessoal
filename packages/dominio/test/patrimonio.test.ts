import { describe, expect, it } from "vitest";
import { aDevolver, deveriaTer, patrimonioLiquido } from "../src/patrimonio.ts";

describe("patrimônio", () => {
  it("soma as partes e desconta o cartão; a receber não entra", () => {
    expect(patrimonioLiquido({ contas: 184035n, cofrinhos: 512000n, investimentos: 989990n, cartao: 160340n })).toBe(1525685n);
  });
  it("deveria ter cresce em linha reta até a meta", () => {
    expect(deveriaTer(300000n, "2026-01-01", "2026-01-11", "2026-01-06")).toBe(150000n);
    expect(deveriaTer(300000n, "2026-01-01", "2027-01-01", "2028-01-01")).toBe(300000n);
  });
  it("a devolver nunca fica negativo", () => {
    expect(aDevolver(16000n, 6000n)).toBe(10000n);
    expect(aDevolver(1000n, 5000n)).toBe(0n);
  });
});
