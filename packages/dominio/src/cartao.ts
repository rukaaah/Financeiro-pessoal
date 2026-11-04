import { type Centavos, deNumeric } from "./dinheiro.ts";

/**
 * Situação de cada fatura (ADR-007, 008, 010). A fatura é identificada pelo mês de
 * vencimento; o que a quita é a perna de pagamento que aponta esse mês.
 */

export type SituacaoDaFatura = "paga" | "parcial" | "aberta" | "atrasada" | "futura";

export interface LinhaDeFatura { readonly mes: string; readonly total: string; readonly pago: string }

export interface Fatura {
  readonly mes: string; // AAAA-MM-01
  readonly vencimento: string; // AAAA-MM-DD
  readonly total: Centavos;
  readonly pago: Centavos;
  readonly falta: Centavos;
  readonly situacao: SituacaoDaFatura;
}

/** Vencimento no mês da fatura, com o dia limitado ao último dia do mês (fevereiro). */
export function vencimentoDe(mes: string, diaDoVencimento: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(Math.min(diaDoVencimento, ultimo)).padStart(2, "0")}`;
}

/**
 * A primeira fatura não quitada que ainda não venceu é a **aberta**; as seguintes são
 * **futuras** (parcelas já comprometidas); as não quitadas que venceram, **atrasadas**.
 */
export function faturasDe(linhas: readonly LinhaDeFatura[], diaDoVencimento: number, hoje: string): Fatura[] {
  let jaTemAberta = false;
  return [...linhas]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((l) => {
      const total = deNumeric(l.total), pago = deNumeric(l.pago);
      const vencimento = vencimentoDe(l.mes, diaDoVencimento);
      const falta = total > pago ? total - pago : 0n;
      let situacao: SituacaoDaFatura;
      if (falta === 0n) situacao = "paga";
      else if (vencimento < hoje) situacao = pago > 0n ? "parcial" : "atrasada";
      else if (!jaTemAberta) { situacao = "aberta"; jaTemAberta = true; }
      else situacao = "futura";
      return { mes: l.mes, vencimento, total, pago, falta, situacao };
    });
}

export function comprometido(faturas: readonly Fatura[]): Centavos {
  return faturas.filter((f) => f.situacao === "futura").reduce((s, f) => s + f.falta, 0n);
}
