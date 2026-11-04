import { describe, expect, it } from "vitest";
import { descontoDe, emReais, estimativa } from "../src/conversao.ts";

describe("dólar para real", () => {
  it("US$ 300,00 pela PTAX 5,47780 = R$ 1.643,34", () => {
    expect(emReais(30000n, "5.47780")).toBe(164334n);
  });
  it("o PayPal ficou com a diferença para o que chegou", () => {
    expect(descontoDe(30000n, 158749n, "5.47780")).toEqual({ centavos: 5585n, pontosBase: 339 });
  });
  it("estimativa desconta o percentual médio medido", () => {
    expect(estimativa(30000n, "5.47780", 339)).toBe(164334n - 5571n);
    expect(estimativa(30000n, "5.47780", 0)).toBe(164334n);
  });
});
