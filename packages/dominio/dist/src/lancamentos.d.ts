import type { Centavos } from "./dinheiro.ts";
/**
 * Lançar por intenção (ADR-011, decisão 5): a pessoa diz o que aconteceu; o sinal, o
 * tipo e as parcelas saem daqui. O banco confere de novo (CHECKs e triggers).
 */
export type Intencao = "gastei" | "recebi";
export type Tipo = "expense" | "income";
export interface NovoLancamento {
    readonly intencao: Intencao;
    readonly valor: Centavos;
    readonly contaId: string;
    readonly categoriaId: string;
    readonly data: string;
    readonly descricao: string;
    readonly parcelas: number;
}
export interface LinhaParaGravar {
    readonly tipo: Tipo;
    readonly valor: Centavos;
    readonly parcela: number | null;
    readonly totalDeParcelas: number | null;
}
export declare class LancamentoInvalido extends Error {
}
/** Divide o total em n parcelas que somam exatamente o total; o centavo que sobra vai na primeira. */
export declare function parcelar(total: Centavos, n: number): Centavos[];
export declare function linhasDe(l: NovoLancamento): LinhaParaGravar[];
/** CSV para planilha brasileira: ponto e vírgula, vírgula decimal, BOM para o Excel abrir em UTF-8. */
export declare function csv(linhas: readonly (readonly string[])[]): string;
