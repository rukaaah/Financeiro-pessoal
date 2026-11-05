import type { Centavos } from "./dinheiro.ts";
/**
 * Patrimônio líquido sem os valores a receber, com as partes à mostra (Portão 1,
 * item 3). CDB é cofrinho e conta uma vez só (item 4).
 */
export declare function patrimonioLiquido(p: {
    contas: Centavos;
    cofrinhos: Centavos;
    investimentos: Centavos;
    cartao: Centavos;
}): Centavos;
/** Quanto o cofrinho deveria ter hoje para chegar na meta na data, em linha reta desde o início. */
export declare function deveriaTer(meta: Centavos, inicio: string, alvo: string, hoje: string): Centavos;
/** A devolver (RF18): empréstimos tirados do cofrinho menos as devoluções marcadas. */
export declare function aDevolver(emprestado: Centavos, devolvido: Centavos): Centavos;
