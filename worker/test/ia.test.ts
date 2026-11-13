import { describe, expect, it } from "vitest";
import { limpar, numerosConferem } from "../src/ia.ts";

describe("IA: o que sai e o que volta", () => {
  it("nome de pessoa fica; conta, CPF e e-mail somem; valor, data e ano ficam", () => {
    expect(limpar("Pix para Ana Souza conta 123456789 CPF 123.456.789-00 ana@x.com R$ 42,50 em 03/11 de 2026")).toBe("Pix para Ana Souza conta ••• CPF ••• ••• R$ 42,50 em 03/11 de 2026");
  });
  it("número citado que não está nos resultados reprova a resposta", () => {
    const resultados = [{ linhas: [{ gasto: "312.00" }, { quantidade: 9 }] }];
    expect(numerosConferem(["312,00", "9", "312.00", "R$ 312,00"], resultados)).toBe(true);
    expect(numerosConferem(["313.00"], resultados)).toBe(false);
  });
});
