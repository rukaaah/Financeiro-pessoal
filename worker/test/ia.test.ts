import { describe, expect, it } from "vitest";
import { mascarar, numerosConferem } from "../src/ia.ts";

describe("IA: o que sai e o que volta", () => {
  it("nome de pessoa vira pessoa A; números de conta somem; valor e data ficam", () => {
    expect(mascarar("Pix para Ana Souza conta 123456789 R$ 42,50 em 03/11", ["Ana Souza"])).toBe("Pix para pessoa A conta ••• R$ 42,50 em 03/11");
  });
  it("número citado que não está nos resultados reprova a resposta", () => {
    const resultados = [{ linhas: [{ gasto: "312.00" }, { quantidade: 9 }] }];
    expect(numerosConferem(["312,00", "9", "312.00", "R$ 312,00"], resultados)).toBe(true);
    expect(numerosConferem(["313.00"], resultados)).toBe(false);
  });
});
