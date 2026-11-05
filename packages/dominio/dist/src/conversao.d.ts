import type { Centavos } from "./dinheiro.ts";
/**
 * Dólar para real pela PTAX (ideia 21, ADR do Portão 1). A taxa do PayPal não é
 * adivinhada: é medida em cada recebimento, como "o quanto o PayPal comeu".
 * Tudo em inteiros: PTAX com 5 casas vira número × 100.000.
 */
export declare function taxaEm5Casas(ptax: string): bigint;
/** Valor em reais de `usd` centavos de dólar pela PTAX. */
export declare function emReais(usd: Centavos, ptax: string): Centavos;
/** Desconto do intermediário: reais pela PTAX − reais que chegaram, e em pontos-base. */
export declare function descontoDe(usd: Centavos, recebido: Centavos, ptax: string): {
    centavos: Centavos;
    pontosBase: number;
};
/** Estimativa antes de receber: PTAX menos o desconto médio dos recebimentos anteriores. */
export declare function estimativa(usd: Centavos, ptax: string, descontoMedioPb: number): Centavos;
