import type { Centavos } from "./dinheiro.ts";

/**
 * Dólar para real pela PTAX (ideia 21, ADR do Portão 1). A taxa do PayPal não é
 * adivinhada: é medida em cada recebimento, como "o quanto o PayPal comeu".
 * Tudo em inteiros: PTAX com 5 casas vira número × 100.000.
 */

export function taxaEm5Casas(ptax: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,5}))?$/.exec(ptax.trim());
  if (!m) throw new Error(`PTAX inválida: ${ptax}`);
  return BigInt(m[1]!) * 100000n + BigInt((m[2] ?? "").padEnd(5, "0"));
}

/** Divide com arredondamento para o centavo mais próximo (meio para cima). */
const dividirArredondando = (a: bigint, b: bigint) => (a * 2n + b) / (2n * b);

/** Valor em reais de `usd` centavos de dólar pela PTAX. */
export function emReais(usd: Centavos, ptax: string): Centavos {
  return dividirArredondando(usd * taxaEm5Casas(ptax), 100000n);
}

/** Desconto do intermediário: reais pela PTAX − reais que chegaram, e em pontos-base. */
export function descontoDe(usd: Centavos, recebido: Centavos, ptax: string): { centavos: Centavos; pontosBase: number } {
  const referencia = emReais(usd, ptax);
  const centavos = referencia - recebido;
  return { centavos, pontosBase: referencia > 0n ? Number((centavos * 10000n) / referencia) : 0 };
}

/** Estimativa antes de receber: PTAX menos o desconto médio dos recebimentos anteriores. */
export function estimativa(usd: Centavos, ptax: string, descontoMedioPb: number): Centavos {
  const bruto = emReais(usd, ptax);
  return bruto - dividirArredondando(bruto * BigInt(Math.round(descontoMedioPb)), 10000n);
}
