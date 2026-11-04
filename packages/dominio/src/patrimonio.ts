import type { Centavos } from "./dinheiro.ts";

/**
 * Patrimônio líquido sem os valores a receber, com as partes à mostra (Portão 1,
 * item 3). CDB é cofrinho e conta uma vez só (item 4).
 */
export function patrimonioLiquido(p: { contas: Centavos; cofrinhos: Centavos; investimentos: Centavos; cartao: Centavos }): Centavos {
  return p.contas + p.cofrinhos + p.investimentos - p.cartao;
}

/** Quanto o cofrinho deveria ter hoje para chegar na meta na data, em linha reta desde o início. */
export function deveriaTer(meta: Centavos, inicio: string, alvo: string, hoje: string): Centavos {
  const t0 = Date.parse(`${inicio}T12:00:00Z`), t1 = Date.parse(`${alvo}T12:00:00Z`), t = Date.parse(`${hoje}T12:00:00Z`);
  if (t >= t1) return meta;
  if (t <= t0) return 0n;
  return (meta * BigInt(Math.round(((t - t0) / (t1 - t0)) * 10000))) / 10000n;
}

/** A devolver (RF18): empréstimos tirados do cofrinho menos as devoluções marcadas. */
export function aDevolver(emprestado: Centavos, devolvido: Centavos): Centavos {
  return emprestado > devolvido ? emprestado - devolvido : 0n;
}
