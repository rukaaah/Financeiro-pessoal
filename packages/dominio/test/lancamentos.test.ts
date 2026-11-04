import { describe, expect, it } from "vitest";
import { csv, LancamentoInvalido, linhasDe, parcelar } from "../src/lancamentos.ts";

const base = { contaId: "c", categoriaId: "k", data: "2026-11-04", descricao: "", parcelas: 1 } as const;

describe("parcelar", () => {
  it("soma exatamente o total, com o centavo que sobra na primeira", () => {
    expect(parcelar(10000n, 3)).toEqual([3334n, 3333n, 3333n]);
    expect(parcelar(90000n, 6).reduce((a, b) => a + b)).toBe(90000n);
  });
});

describe("intenção vira lançamento", () => {
  it("gastei é despesa negativa; recebi é receita positiva", () => {
    expect(linhasDe({ ...base, intencao: "gastei", valor: 4250n })).toEqual([{ tipo: "expense", valor: -4250n, parcela: null, totalDeParcelas: null }]);
    expect(linhasDe({ ...base, intencao: "recebi", valor: 420000n })[0]).toMatchObject({ tipo: "income", valor: 420000n });
  });
  it("compra parcelada vira N linhas numeradas", () => {
    const l = linhasDe({ ...base, intencao: "gastei", valor: 24000n, parcelas: 3 });
    expect(l.map((x) => [x.valor, x.parcela, x.totalDeParcelas])).toEqual([[-8000n, 1, 3], [-8000n, 2, 3], [-8000n, 3, 3]]);
  });
  it("recusa zero, data inválida e receita parcelada", () => {
    expect(() => linhasDe({ ...base, intencao: "gastei", valor: 0n })).toThrow(LancamentoInvalido);
    expect(() => linhasDe({ ...base, intencao: "gastei", valor: 1n, data: "04/11/2026" })).toThrow(LancamentoInvalido);
    expect(() => linhasDe({ ...base, intencao: "recebi", valor: 1n, parcelas: 2 })).toThrow(LancamentoInvalido);
  });
});

describe("csv", () => {
  it("usa ponto e vírgula, escapa aspas e começa com BOM", () => {
    expect(csv([["Data", "Descrição"], ["2026-11-04", 'Pão "francês"; quente']])).toBe('﻿Data;Descrição\r\n2026-11-04;"Pão ""francês""; quente"\r\n');
  });
});
