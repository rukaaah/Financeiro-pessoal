import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import type { Banco, Consulta } from "../src/banco.ts";

// Banco falso: sessão demo e uma fatura de R$ 230,00 com R$ 100,00 já antecipados, vencendo em 2099-05-11.
function bancoFalso(fatura = { total: "230.00", pago: "100.00", dia: 11 }) {
  const gravadas: Consulta[] = [];
  const banco: Banco = {
    async lote(consultas) {
      const [, , ...minhas] = consultas;
      gravadas.push(...minhas.filter((q) => q.texto.includes("insert into transactions")));
      return [[{}], [{ na_allowlist: false, id: "d", email: "demo@exemplo.com", display_name: "Visitante", is_demo: true }],
        ...minhas.map((q) => (q.texto.includes("filter (where t.invoice_month") ? [fatura] : [{ id: "t" }]))];
    },
  };
  return { banco, gravadas };
}
const C = "11111111-1111-1111-1111-111111111111", O = "22222222-2222-2222-2222-222222222222";
const pagar = (banco: Banco, valor: string, data = "2099-03-20") =>
  criarApp({ banco: () => banco, credenciais: async () => null }).request("/api/pagar-fatura", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartao_id: C, conta_id: O, mes: "2099-05", valor, data }),
  });

describe("antecipar fatura pelo Worker", () => {
  it("antecipar o resto de uma fatura futura quita, como transferência sem invoice_month", async () => {
    const { banco, gravadas } = bancoFalso();
    const r = await pagar(banco, "130,00");
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, quita: true, falta: "0.00", antecipado: true });
    expect(gravadas).toHaveLength(2);
    expect(gravadas.every((q) => q.texto.includes("'transfer'") && !q.texto.includes("invoice_month,"))).toBe(true);
    expect(gravadas[1]!.texto).toContain("settles_invoice_month");
  });

  it("antecipar parte deixa o resto", async () => {
    const r = await pagar(bancoFalso().banco, "30,00");
    expect(await r.json()).toEqual({ ok: true, quita: false, falta: "100.00", antecipado: true });
  });

  it("acima do que falta é recusado sem gravar nada", async () => {
    const { banco, gravadas } = bancoFalso();
    const r = await pagar(banco, "130,01");
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toContain("R$ 130,00");
    expect(gravadas).toHaveLength(0);
  });

  it("fatura sem nada a pagar (ou de outra pessoa, invisível pela RLS) é recusada", async () => {
    const { banco, gravadas } = bancoFalso({ total: "0.00", pago: "0.00", dia: 11 });
    expect((await pagar(banco, "1,00")).status).toBe(400);
    expect(gravadas).toHaveLength(0);
  });

  it("pagar no vencimento não conta como antecipação", async () => {
    const r = await pagar(bancoFalso().banco, "130,00", "2099-05-11");
    expect(await r.json()).toMatchObject({ antecipado: false });
  });
});
