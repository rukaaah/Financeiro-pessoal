import { describe, expect, it } from "vitest";
import { CATEGORIAS_BASE, GRUPOS_BASE } from "../src/categorias-base.ts";

describe("categorias base", () => {
  it("toda categoria tem grupo da lista, e nomes não se repetem (o banco exige)", () => {
    const grupos = new Set(GRUPOS_BASE.map((g) => g.nome));
    expect(grupos.size).toBe(GRUPOS_BASE.length);
    for (const k of CATEGORIAS_BASE) expect(grupos.has(k.grupo)).toBe(true);
    expect(new Set(CATEGORIAS_BASE.map((k) => k.nome)).size).toBe(CATEGORIAS_BASE.length);
  });

  it("todo grupo tem categoria, e só Renda tem receita", () => {
    for (const g of GRUPOS_BASE) expect(CATEGORIAS_BASE.some((k) => k.grupo === g.nome)).toBe(true);
    expect(CATEGORIAS_BASE.filter((k) => k.tipo === "income").map((k) => k.nome)).toEqual(["Salário", "Freelance"]);
    expect(CATEGORIAS_BASE.filter((k) => k.tipo === "income").every((k) => k.grupo === "Renda")).toBe(true);
  });
});
