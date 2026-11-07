import { describe, expect, it } from "vitest";
import { chaveDoCofrinho, cofrinhoNaDescricao, conferirLeituraDaIA, lerTrechoDeData, linhasComValorDeFora } from "../src/leitura-de-extrato.ts";

// Texto sintético num formato que a regra não conhece: data como cabeçalho do dia.
const TEXTO = [
  "Extrato de conta",          // 0
  "03 de novembro de 2026",    // 1
  "Compra no débito MERCADO BOM PRECO - R$ 87,40", // 2
  "Pix recebido pessoa A + R$ 150,00",             // 3
  "Guardado no Cofrinho Viagem Japão R$ 300,00",   // 4
  "04 NOV",                    // 5
  "Resgate Cofrinho Reserva 120,00",               // 6
  "Saldo do dia R$ 1.000,00",  // 7
  "Tarifa 12,90",              // 8
];
const HOJE = "2026-11-07";

describe("conferência da leitura de extrato pela IA", () => {
  it("aceita o que bate com o texto e relê valor e data por regra", () => {
    const r = conferirLeituraDaIA(TEXTO, [
      { linha: 2, trecho_valor: "- R$ 87,40", trecho_data: "03 de novembro de 2026", data: "2026-11-03", descricao: "MERCADO BOM PRECO", tipo: "gasto", categoria_id: "k1" },
      { linha: 3, trecho_valor: "+ R$ 150,00", trecho_data: "03 de novembro de 2026", data: "2026-11-03", descricao: "Pix recebido pessoa A", tipo: "entrada" },
      { linha: 4, trecho_valor: "R$ 300,00", trecho_data: "03 de novembro de 2026", data: "2026-11-03", descricao: "Guardado no Cofrinho Viagem Japão", tipo: "guardar", cofrinho: "Viagem Japão" },
      { linha: 6, trecho_valor: "120,00", trecho_data: "04 NOV", data: "2026-11-04", descricao: "Resgate Cofrinho Reserva", tipo: "resgatar", cofrinho: "Reserva" },
    ], HOJE);
    expect(r.descartadas).toBe(0);
    expect(r.linhas.map((l) => [l.data, l.valor, l.tipo, l.cofrinho, l.categoria_id])).toEqual([
      ["2026-11-03", -8740n, "gasto", null, "k1"],
      ["2026-11-03", 15000n, "entrada", null, null],
      ["2026-11-03", -30000n, "guardar", "Viagem Japão", null],
      ["2026-11-04", 12000n, "resgatar", "Reserva", null],
    ]);
  });

  it("descarta valor que não está na linha, sinal que contradiz o tipo, data ausente e cofrinho inventado", () => {
    const r = conferirLeituraDaIA(TEXTO, [
      { linha: 2, trecho_valor: "R$ 78,40", trecho_data: "03 de novembro de 2026", tipo: "gasto" },
      { linha: 2, trecho_valor: "- R$ 87,40", trecho_data: "03 de novembro de 2026", tipo: "entrada" },
      { linha: 8, trecho_valor: "12,90", trecho_data: "05/11", tipo: "gasto" },
      { linha: 4, trecho_valor: "R$ 300,00", trecho_data: "03 de novembro de 2026", tipo: "guardar", cofrinho: "Casa nova" },
      { linha: 99, trecho_valor: "1,00", trecho_data: "04 NOV", tipo: "gasto" },
      "lixo",
    ], HOJE);
    expect(r.linhas).toEqual([]);
    expect(r.descartadas).toBe(6);
  });

  it("a mesma linha com o mesmo valor entra uma vez só", () => {
    const item = { linha: 8, trecho_valor: "12,90", trecho_data: "04 NOV", tipo: "gasto" };
    expect(conferirLeituraDaIA(TEXTO, [item, item], HOJE)).toMatchObject({ descartadas: 1, linhas: [{ valor: -1290n, data: "2026-11-04" }] });
  });

  it("data sem ano não vai para o futuro", () => {
    const r = conferirLeituraDaIA(["15/12 Loja 10,00"], [{ linha: 0, trecho_valor: "10,00", trecho_data: "15/12", data: "2026-12-15", tipo: "gasto" }], HOJE);
    expect(r.linhas[0]?.data).toBe("2025-12-15");
  });
});

describe("trechos de data", () => {
  it("lê os formatos comuns de extrato", () => {
    expect(lerTrechoDeData("03/11/2026")).toEqual({ dia: 3, mes: 11, ano: 2026 });
    expect(lerTrechoDeData("3 de novembro")).toEqual({ dia: 3, mes: 11, ano: null });
    expect(lerTrechoDeData("Seg, 03 de mar. de 2026")).toEqual({ dia: 3, mes: 3, ano: 2026 });
    expect(lerTrechoDeData("ontem")).toBeNull();
  });
});

describe("cofrinho e omissões", () => {
  it("acha o nome do cofrinho numa descrição lida pela regra", () => {
    expect(cofrinhoNaDescricao("Guardado no Cofrinho Viagem")).toBe("Viagem");
    expect(cofrinhoNaDescricao("Resgate cofrinho: Reserva de emergência")).toBe("Reserva de emergência");
    expect(cofrinhoNaDescricao("Pix enviado")).toBeNull();
    expect(chaveDoCofrinho("  Viagem  JAPÃO ")).toBe("viagem japao");
  });
  it("avisa as linhas com valor que ficaram de fora, sem contar saldo", () => {
    expect(linhasComValorDeFora(TEXTO, [2, 3, 4, 6])).toEqual([8]);
  });
});
