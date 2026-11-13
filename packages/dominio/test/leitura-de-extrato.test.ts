import { describe, expect, it } from "vitest";
import { chaveDoCofrinho, cofrinhoNaDescricao, nomeDoCofrinho, conferirLeituraDaIA, lerCsvDeExtrato, lerTrechoDeData, lerValorDeExtrato, linhasComValorDeFora } from "../src/leitura-de-extrato.ts";

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
    expect(lerTrechoDeData("2026-11-03")).toEqual({ dia: 3, mes: 11, ano: 2026 });
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
  it("separa o nome do cofrinho da ação de guardar ou resgatar", () => {
    expect(nomeDoCofrinho("Jogos · Dinheiro resgatado")).toBe("Jogos");
    expect(nomeDoCofrinho("Investimento · Dinheiro guardado")).toBe("Investimento");
    expect(nomeDoCofrinho("Dinheiro guardado | Investimento")).toBe("Investimento");
    expect(nomeDoCofrinho("Investimento - Novembro · Dinheiro guardado")).toBe("Investimento - Novembro");
    expect(nomeDoCofrinho("Guardado no Cofrinho Viagem")).toBe("Viagem");
    expect(nomeDoCofrinho("Dinheiro guardado")).toBeNull();
    expect(cofrinhoNaDescricao("Jogos · Dinheiro resgatado")).toBe("Jogos");
    expect(chaveDoCofrinho("Jogos · Dinheiro guardado")).toBe(chaveDoCofrinho("jogos"));
  });
  it("a IA que junta a ação ao nome tem o nome limpo; os dois sentidos dão o mesmo cofrinho", () => {
    const linhas = ["05/11/2026", "Jogos · Dinheiro guardado R$ 675,64", "Jogos · Dinheiro resgatado R$ 520,00"];
    const r = conferirLeituraDaIA(linhas, [
      { linha: 1, trecho_valor: "R$ 675,64", trecho_data: "05/11/2026", tipo: "guardar", cofrinho: "Jogos · Dinheiro guardado" },
      { linha: 2, trecho_valor: "R$ 520,00", trecho_data: "05/11/2026", tipo: "resgatar", cofrinho: "Jogos · Dinheiro resgatado" },
    ], "2026-11-08");
    expect(r.linhas.map((l) => [l.tipo, l.cofrinho, l.valor])).toEqual([["guardar", "Jogos", -67564n], ["resgatar", "Jogos", 52000n]]);
  });
  it("avisa as linhas com valor que ficaram de fora, sem contar saldo", () => {
    expect(linhasComValorDeFora(TEXTO, [2, 3, 4, 6])).toEqual([8]);
  });
});

describe("valor nas duas grafias", () => {
  it("lê vírgula ou ponto decimal, com sinal antes, depois ou D/C", () => {
    expect(["1.234,56", "-87,40", "R$ -87,40", "-87.40", "1,234.56", "87,40 D", "150,00 C", "12", "03/11"].map(lerValorDeExtrato))
      .toEqual([123456n, -8740n, -8740n, -8740n, 123456n, -8740n, 15000n, null, null]);
  });
  it("a IA pode citar valor com ponto decimal de um CSV", () => {
    const r = conferirLeituraDaIA(["2026-11-03;MERCADO;-87.40"], [{ linha: 0, trecho_valor: "-87.40", trecho_data: "2026-11-03", tipo: "gasto" }], HOJE);
    expect(r.linhas.map((l) => [l.data, l.valor])).toEqual([["2026-11-03", -8740n]]);
  });
});

describe("CSV de extrato pelo cabeçalho", () => {
  it("acha data, descrição e valor em qualquer ordem e separador", () => {
    const csv = "Extrato da conta\nData;Descrição;Tipo;Valor;Saldo\n03/11/2026;MERCADO BOM;Compra;-87,40;912,60\n04/11/2026;\"Pix, recebido\";Pix;150,00;1062,60\n";
    expect(lerCsvDeExtrato(csv)).toEqual({ ignoradas: 0, linhas: [
      { data: "2026-11-03", descricao: "MERCADO BOM · Compra", valor: -8740n, original: "03/11/2026 · MERCADO BOM · Compra · -87,40 · 912,60" },
      { data: "2026-11-04", descricao: "Pix, recebido · Pix", valor: 15000n, original: "04/11/2026 · Pix, recebido · Pix · 150,00 · 1062,60" },
    ] });
  });
  it("entrada e saída em colunas separadas, data ISO e ponto decimal", () => {
    const csv = "date,description,credit,debit\n2026-11-03,UBER,,18.90\n2026-11-05,SALARIO,4200.00,\n";
    expect(lerCsvDeExtrato(csv.replace("credit", "crédito").replace("debit", "débito"))?.linhas.map((l) => l.valor)).toEqual([-1890n, 420000n]);
  });
  it("nome de quem recebeu, em coluna própria, entra na descrição", () => {
    const csv = "Data;Descrição;Destinatário;Valor\n03/11/2026;Pix enviado;Maria Souza;-50,00\n";
    expect(lerCsvDeExtrato(csv)?.linhas[0]?.descricao).toBe("Pix enviado · Maria Souza");
  });
  it("texto que não é CSV de extrato devolve null", () => {
    expect(lerCsvDeExtrato("03/11/2026 Compra R$ 10,00")).toBeNull();
  });
});
