import { describe, expect, it } from "vitest";
import { conferirTransferencia, csv, LancamentoInvalido, linhasDaEdicao, linhasDe, parcelar } from "../src/lancamentos.ts";

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

describe("edição de lançamento", () => {
  const e = { tipo: "expense", valor: 10000n, data: "2026-11-04", parcelas: 1, tipoDaConta: "checking" } as const;
  it("troca gasto por receita e muda o sinal", () => {
    expect(linhasDaEdicao({ ...e, tipo: "income" })).toEqual([{ tipo: "income", valor: 10000n, parcela: null, totalDeParcelas: null }]);
  });
  it("muda o número de parcelas de uma compra no cartão, somando o total", () => {
    const l = linhasDaEdicao({ ...e, tipoDaConta: "credit_card", parcelas: 4 });
    expect(l.map((x) => x.parcela)).toEqual([1, 2, 3, 4]);
    expect(l.reduce((s, x) => s + x.valor, 0n)).toBe(-10000n);
    expect(linhasDaEdicao({ ...e, tipoDaConta: "credit_card" })).toHaveLength(1);
  });
  it("recusa parcela fora do cartão, receita no cartão e conta de outro tipo", () => {
    expect(() => linhasDaEdicao({ ...e, parcelas: 2 })).toThrow("Parcelas só no cartão.");
    expect(() => linhasDaEdicao({ ...e, tipo: "income", tipoDaConta: "credit_card" })).toThrow("Receita não entra no cartão.");
    expect(() => linhasDaEdicao({ ...e, tipoDaConta: "goal" })).toThrow(LancamentoInvalido);
    expect(() => linhasDaEdicao({ ...e, valor: 0n })).toThrow(LancamentoInvalido);
  });
  it("transferência precisa de valor, data válida e duas contas diferentes", () => {
    const t = { valor: 100n, data: "2026-11-04", origem: "a", destino: "b" };
    expect(() => conferirTransferencia(t)).not.toThrow();
    expect(() => conferirTransferencia({ ...t, destino: "a" })).toThrow(LancamentoInvalido);
    expect(() => conferirTransferencia({ ...t, valor: -1n })).toThrow(LancamentoInvalido);
    expect(() => conferirTransferencia({ ...t, data: "2026-13-40" })).toThrow(LancamentoInvalido);
  });
});

describe("csv", () => {
  it("usa ponto e vírgula, escapa aspas e começa com BOM", () => {
    expect(csv([["Data", "Descrição"], ["2026-11-04", 'Pão "francês"; quente']])).toBe('﻿Data;Descrição\r\n2026-11-04;"Pão ""francês""; quente"\r\n');
  });
});
