import { describe, expect, it } from "vitest";
import { chaveDeDuplicidade, conferirSaldos, lerExtrato, lerNotificacao } from "../src/entrada.ts";

describe("notificação colada", () => {
  it("compra no cartão: valor, data, estabelecimento", () => {
    expect(lerNotificacao("Compra aprovada no cartão final 1234 de R$ 42,50 em IFOOD *RESTAURANTE em 03/11 às 20:14.", "2026-11-04")).toEqual({
      valor: 4250n, data: "2026-11-03", estabelecimento: "IFOOD RESTAURANTE", sentido: "saida", noCartao: true, parcelas: null,
    });
  });
  it("PIX recebido é entrada; parcelado em 3x", () => {
    expect(lerNotificacao("Você recebeu um Pix de R$ 1.200,00", "2026-11-04")).toMatchObject({ valor: 120000n, sentido: "entrada" });
    expect(lerNotificacao("Compra aprovada de R$ 300,00 em 3x na LOJA X", "2026-11-04")?.parcelas).toBe(3);
  });
  it("data sem ano que cairia no futuro é do ano passado; sem valor não reconhece", () => {
    expect(lerNotificacao("Compra de R$ 10,00 em 30/12", "2026-11-04")?.data).toBe("2025-12-30");
    expect(lerNotificacao("Seu código de verificação é 123456", "2026-11-04")).toBeNull();
  });
});

describe("extrato", () => {
  const texto = ["01/11/2026 Salário R$ 4.200,00", "02/11/2026 Mercado Bom Preço -R$ 221,50", "02/11/2026 Saldo do dia R$ 5.818,85", "lixo de cabeçalho", "03/11/2026 Uber - R$ 18,90", "03/11/2026 Saldo do dia R$ 5.799,95"].join("\n");
  it("lê linhas e saldos e ignora o resto", () => {
    const l = lerExtrato(texto);
    expect(l.linhas.map((x) => x.valor)).toEqual([420000n, -22150n, -1890n]);
    expect(l.saldos).toHaveLength(2);
    expect(l.ignoradas).toBe(1);
  });
  it("confere pelo saldo diário impresso", () => {
    expect(conferirSaldos(lerExtrato(texto), 184035n)).toEqual([]);
    expect(conferirSaldos(lerExtrato(texto), 184000n).map((d) => d.data)).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("duplicidade ignora número de terminal e prefixo", () => {
    expect(chaveDeDuplicidade({ data: "2026-11-02", valor: -100n, descricao: "PAG*Padaria 00123" })).toBe(chaveDeDuplicidade({ data: "2026-11-02", valor: -100n, descricao: "PADARIA" }));
  });
});
