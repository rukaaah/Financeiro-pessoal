import { describe, expect, it } from "vitest";
import { itensDeAtencao, saldoProjetado } from "../src/atencao.ts";
import { formatar } from "../src/dinheiro.ts";

const contas = [
  { id: "luz", nome: "Conta de luz", valor: 12000n, vencimento: "2026-11-06", urgencia: "essential" as const, paga: false, noCartao: false },
  { id: "net", nome: "Internet", valor: 10000n, vencimento: "2026-11-30", urgencia: "important" as const, paga: false, noCartao: false },
  { id: "muay", nome: "Muay thai", valor: 15000n, vencimento: "2026-11-02", urgencia: "important" as const, paga: true, noCartao: false },
];
const faturas = [{ cartao: "u", nome: "Unicred", mes: "2026-11-01", vencimento: "2026-11-11", falta: 84340n }];
const entradas = [{ id: "f", descricao: "Freelance", data: "2026-11-25", estimativa: 156840n }];
const base = { hoje: "2026-11-04", mes: "2026-11", categorias: [], contas, faturas, entradas, adiados: new Map<string, string | null>(), formatar };

describe("Atenção", () => {
  it("conta paga sai; perto do vencimento é atenção; longe é informativa; fatura em 7 dias é informativa", () => {
    const i = itensDeAtencao(base);
    expect(i.map((x) => [x.chave, x.gravidade])).toEqual([["conta:luz:2026-11", "atencao"], ["fatura:u:2026-11-01", "informativo"], ["conta:net:2026-11", "informativo"]]);
    expect(i[0]!.titulo).toBe("Conta de luz vence em 2 dias");
  });
  it("lembrar amanhã esconde até amanhã; resolvido esconde de vez", () => {
    const adiados = new Map<string, string | null>([["conta:luz:2026-11", "2026-11-05"], ["conta:net:2026-11", null]]);
    expect(itensDeAtencao({ ...base, adiados }).map((x) => x.chave)).toEqual(["fatura:u:2026-11-01"]);
    expect(itensDeAtencao({ ...base, adiados, hoje: "2026-11-05" }).map((x) => x.chave)).toContain("conta:luz:2026-11");
  });
  it("entrada prevista vencida pede para registrar o recebimento", () => {
    expect(itensDeAtencao({ ...base, hoje: "2026-11-25" }).find((x) => x.chave === "entrada:f")).toMatchObject({ gravidade: "atencao", titulo: "Freelance previsto para hoje" });
  });
});

describe("saldo projetado", () => {
  it("contas e fatura saem no vencimento, entrada entra na data, livre gasto por igual", () => {
    const p = saldoProjetado({ hoje: "2026-11-04", fimDoMes: "2026-11-30", saldoHoje: 184035n, livre: 27000n, contas, faturas, entradas });
    expect(p).toHaveLength(27);
    const fim = p[p.length - 1]!.saldo;
    expect(fim).toBe(184035n - 27000n - 12000n - 10000n - 84340n + 156840n);
    expect(p.find((x) => x.dia === "2026-11-11")!.saldo).toBe(184035n - 1000n * 8n - 12000n - 84340n);
  });
});
