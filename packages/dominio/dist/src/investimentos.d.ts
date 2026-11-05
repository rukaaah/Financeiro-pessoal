import { type Centavos } from "./dinheiro.ts";
/**
 * Carteira (RF09, RF15): posição calculada das operações, alocação contra a meta e
 * "Onde aportar" pelas regras do próprio Pedro. Não é recomendação de analista.
 * Quantidade e preço chegam como texto de numeric e são tratados em inteiros.
 */
export type Classe = "paper" | "brick" | "logistics" | "infra" | "treasury" | "other";
export declare const NOME_DA_CLASSE: Record<Classe, string>;
export declare function deDecimal6(t: string): bigint;
export interface Operacao {
    readonly quantidade: string;
    readonly preco: string;
}
export interface Posicao {
    readonly quantidade6: bigint;
    readonly precoMedio6: bigint;
    readonly custo: Centavos;
}
/** Preço médio ponderado das compras; venda reduz a quantidade sem mudar o preço médio. */
export declare function posicaoDe(ops: readonly Operacao[]): Posicao;
export declare const valorDe: (p: Posicao, preco: string | null) => Centavos;
export interface AtivoNaCarteira {
    ticker: string;
    classe: Classe;
    valor: Centavos;
    preco: string | null;
    pvp: number | null;
    liquidez: number | null;
}
export interface Regras {
    maxPvp: number;
    maxPeso: number;
    minLiquidez: number;
    metas: Partial<Record<Classe, number>>;
}
export interface Sugestao {
    ticker: string;
    valor: Centavos;
    cotas: number | null;
    motivo: string;
}
/**
 * Distribui o aporte: classes abaixo da meta recebem em proporção ao que falta; dentro
 * da classe, o ativo elegível de menor P/VP; cota inteira; a sobra vai para o destino
 * da sobra. Ativo barrado diz por quê.
 */
export interface ResultadoDoAporte {
    sugestoes: Sugestao[];
    fora: {
        ticker: string;
        motivo: string;
    }[];
    sobra: Centavos;
    avisos: string[];
}
export declare function ondeAportar(ativos: readonly AtivoNaCarteira[], regras: Regras, aporte: Centavos): ResultadoDoAporte;
/** Projeção com premissas visíveis: aporte mensal, DY ao ano reinvestido. Não é previsão. */
export declare function projetar(inicial: Centavos, aporteMensal: Centavos, dyAnoPct: number, anos: number): Centavos[];
/** Linha do relatório da carteira: o que mudou e o que pede atenção, pelas regras do Pedro. */
export interface AtivoNoRelatorio {
    ticker: string;
    classe: Classe;
    valor: Centavos;
    preco: number | null;
    precoAnterior: number | null;
    preco30d: number | null;
    pvp: number | null;
    dy: number | null;
    liquidez: number | null;
    cotadoEm: string | null;
}
export interface Alerta {
    ticker: string;
    tipo: "oportunidade" | "atencao";
    texto: string;
}
export interface Relatorio {
    rendaMensal: Centavos;
    alertas: Alerta[];
    desatualizado: string | null;
}
/** Dia útil anterior a `hoje` (só fim de semana; feriado conta como dia útil). */
export declare function diaUtilAnterior(hoje: string): string;
/**
 * Renda estimada por mês (DY de 12 meses sobre o valor de hoje, dividido por 12), alertas
 * de P/VP, liquidez e queda forte, e aviso quando a cotação mais nova é velha demais.
 */
export declare function relatorioDaCarteira(ativos: readonly AtivoNoRelatorio[], regras: Regras, hoje: string): Relatorio;
