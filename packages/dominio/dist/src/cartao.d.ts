import { type Centavos } from "./dinheiro.ts";
/**
 * Situação de cada fatura (ADR-007, 008, 010). A fatura é identificada pelo mês de
 * vencimento; o que a quita é a perna de pagamento que aponta esse mês.
 */
export type SituacaoDaFatura = "paga" | "parcial" | "aberta" | "atrasada" | "futura";
export interface LinhaDeFatura {
    readonly mes: string;
    readonly total: string;
    readonly pago: string;
}
export interface Fatura {
    readonly mes: string;
    readonly vencimento: string;
    readonly total: Centavos;
    readonly pago: Centavos;
    readonly falta: Centavos;
    readonly situacao: SituacaoDaFatura;
}
/** Vencimento no mês da fatura, com o dia limitado ao último dia do mês (fevereiro). */
export declare function vencimentoDe(mes: string, diaDoVencimento: number): string;
/**
 * A primeira fatura não quitada que ainda não venceu é a **aberta**; as seguintes são
 * **futuras** (parcelas já comprometidas); as não quitadas que venceram, **atrasadas**.
 */
export declare function faturasDe(linhas: readonly LinhaDeFatura[], diaDoVencimento: number, hoje: string): Fatura[];
export declare function comprometido(faturas: readonly Fatura[]): Centavos;
/**
 * Pagar ou antecipar uma fatura (total ou parcial). O pagamento é transferência com a perna do
 * cartão apontando o mês da fatura (ADR-010), sem `invoice_month`: não é gasto. Antecipar é só
 * pagar antes do vencimento, inclusive uma fatura futura; o que já foi pago abate o que falta.
 * Não se paga mais do que falta, para o valor não sumir num mês que nenhuma tela mostra.
 */
export type PagamentoDaFatura = {
    readonly ok: true;
    readonly quita: boolean;
    readonly resta: Centavos;
    readonly antecipado: boolean;
    readonly diasAntes: number;
} | {
    readonly ok: false;
    readonly motivo: "valor-invalido" | "nada-a-pagar" | "acima-do-que-falta";
};
export declare function pagamentoDaFatura(f: {
    readonly vencimento: string;
    readonly falta: Centavos;
}, valor: Centavos, data: string): PagamentoDaFatura;
