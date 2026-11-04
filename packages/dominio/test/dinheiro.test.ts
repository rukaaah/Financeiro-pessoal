import { describe, expect, it } from "vitest";
import { deDigitado, deNumeric, formatar, paraNumeric, somar } from "../src/dinheiro.ts";

describe("dinheiro em centavos", () => {
  it("lê numeric do banco sem passar por ponto flutuante", () => {
    expect(deNumeric("0.10") + deNumeric("0.20")).toBe(30n);
    expect(deNumeric("1234.5")).toBe(123450n);
    expect(deNumeric("-843.40")).toBe(-84340n);
    expect(deNumeric("7")).toBe(700n);
  });

  it("recusa texto que não é numeric(14,2)", () => {
    expect(() => deNumeric("1,50")).toThrow();
    expect(() => deNumeric("1.234")).toThrow();
    expect(() => deNumeric("")).toThrow();
  });

  it("volta para numeric com duas casas", () => {
    expect(paraNumeric(123450n)).toBe("1234.50");
    expect(paraNumeric(-5n)).toBe("-0.05");
    expect(paraNumeric(0n)).toBe("0.00");
  });

  it("lê o que a pessoa digita no formato brasileiro", () => {
    expect(deDigitado("1.234,56")).toBe(123456n);
    expect(deDigitado("42,5")).toBe(4250n);
    expect(deDigitado("R$ 42")).toBe(4200n);
    expect(deDigitado("1234,56")).toBe(123456n);
    expect(() => deDigitado("42,555")).toThrow();
    expect(() => deDigitado("12.34")).toThrow();
  });

  it("formata como o app mostra", () => {
    expect(formatar(48499n)).toBe("R$ 484,99");
    expect(formatar(152568500n)).toBe("R$ 1.525.685,00");
    expect(formatar(-160340n)).toBe("−R$ 1.603,40");
  });

  it("soma exata", () => {
    expect(somar([deNumeric("21.68"), deNumeric("8.34"), -deNumeric("3.81")])).toBe(2621n);
  });
});
