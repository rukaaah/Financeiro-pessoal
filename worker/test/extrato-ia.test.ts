import { describe, expect, it } from "vitest";
import { lerExtratoComIA, mascararExtrato } from "../src/extrato-ia.ts";

describe("extrato para a IA: o que sai", () => {
  it("nome de Pix, pessoa cadastrada, CPF, e-mail e conta saem; valor, data e cofrinho ficam", () => {
    const { linhas, restaurar } = mascararExtrato(
      "Titular: Pedro Teste CPF ***.456.789-**\nAgência 0001 Conta 1234567-8 contato@exemplo.com\n03/11/2026 Pix enviado para Maria Souza - R$ 50,00\n3 de novembro de 2026 Pix recebido de Ana Lima R$ 20,00\nGuardado no Cofrinho Viagem R$ 300,00",
      ["Ana Lima", "Pedro Teste"],
    );
    expect(linhas).toEqual([
      "Titular: pessoa A CPF •••",
      "Agência ••• Conta •••-8 •••",
      "03/11/2026 Pix enviado para pessoa B - R$ 50,00",
      "3 de novembro de 2026 Pix recebido de pessoa C R$ 20,00",
      "Guardado no Cofrinho Viagem R$ 300,00",
    ]);
    expect(restaurar("Pix enviado para pessoa B")).toBe("Pix enviado para Maria Souza");
  });
});

describe("extrato lido pela IA, com modelo falso", () => {
  const categorias = [{ id: "00000000-0000-0000-0000-00000000000a", nome: "Mercado", tipo: "expense" }];
  it("só passa o que confere; nomes voltam; avisa linha com valor que ficou de fora", async () => {
    const texto = "03/11/2026\nPix enviado para Maria Souza - R$ 50,00\nMERCADO BOM - R$ 87,40\nGuardado no Cofrinho Viagem R$ 300,00\nTarifa R$ 12,90";
    const ia = { run: async () => ({ response: JSON.stringify({ itens: [
      { linha: 1, trecho_valor: "- R$ 50,00", trecho_data: "03/11/2026", descricao: "Pix enviado para pessoa A", tipo: "gasto" },
      { linha: 2, trecho_valor: "- R$ 87,40", trecho_data: "03/11/2026", descricao: "MERCADO BOM", tipo: "gasto", categoria_id: categorias[0]!.id },
      { linha: 3, trecho_valor: "R$ 300,00", trecho_data: "03/11/2026", descricao: "Guardado no Cofrinho Viagem", tipo: "guardar", cofrinho: "Viagem" },
      { linha: 4, trecho_valor: "R$ 99,99", trecho_data: "03/11/2026", tipo: "gasto" },
    ] }) }) };
    const r = await lerExtratoComIA(ia, "m", texto, [], categorias, "2026-11-07");
    expect(r.linhas.map((l) => [l.descricao, l.valor, l.tipo, l.cofrinho, l.categoria_id])).toEqual([
      ["Pix enviado para Maria Souza", "-50.00", "gasto", null, null],
      ["MERCADO BOM", "-87.40", "gasto", null, categorias[0]!.id],
      ["Guardado no Cofrinho Viagem", "-300.00", "guardar", "Viagem", null],
    ]);
    expect(r.descartadas).toBe(1);
    expect(r.de_fora).toBe(1);
  });
});
