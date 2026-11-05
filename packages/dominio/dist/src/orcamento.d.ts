import { type Centavos } from "./dinheiro.ts";
/**
 * A posição do mês (05-arquitetura-de-informacao.md §1): quatro números separados,
 * como o Pedro pediu no Portão 1, e todas as telas leem daqui. Nenhuma tela soma por
 * conta própria — foi a causa dos três "quanto resta" do diagnóstico.
 */
export interface LinhaDeCategoria {
    readonly id: string;
    readonly nome: string;
    readonly tipo: "expense" | "income";
    readonly grupo: string;
    readonly previsto: string;
    readonly ajustado: boolean;
    readonly realizado: string;
    readonly media3m: string;
}
export type Estado = "dentro" | "perto" | "fora";
export interface Categoria {
    readonly id: string;
    readonly nome: string;
    readonly grupo: string;
    readonly previsto: Centavos;
    readonly gasto: Centavos;
    readonly media3m: Centavos;
    readonly ajustado: boolean;
    readonly estado: Estado;
}
export interface PosicaoDoMes {
    readonly previsto: Centavos;
    readonly gasto: Centavos;
    readonly aPagar: Centavos;
    readonly livre: Centavos;
    readonly porDia: Centavos;
    readonly diasRestantes: number;
    readonly diaDoMes: number;
    readonly diasNoMes: number;
    readonly rendaPrevista: Centavos;
    readonly renda: Centavos;
    readonly guardado: Centavos;
    readonly sobra: Centavos;
    readonly categorias: readonly Categoria[];
    readonly descoberta: string | null;
}
/** Perto do limite a partir de 80% do previsto (RF20, prazo padrão aprovado). */
export declare const LIMIAR_PERTO = 80n;
export declare function estadoDe(gasto: Centavos, previsto: Centavos): Estado;
/**
 * `hoje` e `mes` em AAAA-MM-DD e AAAA-MM. Num mês passado não há dias restantes; num
 * mês futuro, o mês inteiro está pela frente.
 */
export declare function posicaoDoMes(linhas: readonly LinhaDeCategoria[], opcoes: {
    mes: string;
    hoje: string;
    aPagar: Centavos;
    guardado: Centavos;
    formatar(v: Centavos): string;
}): PosicaoDoMes;
