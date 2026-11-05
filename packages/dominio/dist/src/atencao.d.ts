import type { Centavos } from "./dinheiro.ts";
import type { Categoria } from "./orcamento.ts";
/**
 * A aba Atenção (RF20) e o saldo projetado (ideia 7). Prazos aprovados no Portão 1:
 * lembrete 3 dias antes da conta, 5 dias antes da fatura, orçamento em 80%.
 */
export type Gravidade = "critico" | "atencao" | "informativo";
export type Urgencia = "essential" | "important" | "deferrable";
export interface ContaRecorrente {
    id: string;
    nome: string;
    valor: Centavos;
    vencimento: string;
    urgencia: Urgencia;
    paga: boolean;
    noCartao: boolean;
}
export interface FaturaPendente {
    cartao: string;
    nome: string;
    mes: string;
    vencimento: string;
    falta: Centavos;
}
export interface EntradaPrevista {
    id: string;
    descricao: string;
    data: string;
    estimativa: Centavos;
}
export interface Item {
    readonly chave: string;
    readonly gravidade: Gravidade;
    readonly titulo: string;
    readonly detalhe: string;
    readonly valor: Centavos;
    readonly data: string | null;
    readonly acao: {
        tipo: "ver-categoria";
        id: string;
    } | {
        tipo: "pagar-conta";
        id: string;
    } | {
        tipo: "pagar-fatura";
        cartao: string;
        mes: string;
    } | {
        tipo: "receber";
        id: string;
    } | {
        tipo: "nenhuma";
    };
}
export declare const URGENCIA: Record<Urgencia, string>;
export declare const diasEntre: (de: string, ate: string) => number;
export declare function itensDeAtencao(e: {
    hoje: string;
    mes: string;
    categorias: readonly Categoria[];
    contas: readonly ContaRecorrente[];
    faturas: readonly FaturaPendente[];
    entradas: readonly EntradaPrevista[];
    adiados: ReadonlyMap<string, string | null>;
    formatar(v: Centavos): string;
    menorSaldo?: {
        dia: string;
        valor: Centavos;
    } | null;
}): Item[];
/**
 * Saldo da conta do dia a dia, de hoje ao fim do mês: contas e fatura saem no
 * vencimento, entradas previstas entram na data, e o livre do mês é gasto por igual.
 */
export declare function saldoProjetado(e: {
    hoje: string;
    fimDoMes: string;
    saldoHoje: Centavos;
    livre: Centavos;
    contas: readonly ContaRecorrente[];
    faturas: readonly FaturaPendente[];
    entradas: readonly EntradaPrevista[];
}): {
    dia: string;
    saldo: Centavos;
}[];
/**
 * "Repetir todo mês" no Lançar: o gasto de hoje vira uma conta recorrente que vence todo
 * mês no mesmo dia, com o mesmo valor, categoria e conta. Monta o pedido de
 * /api/contas-recorrentes; quem decide urgência e o resto continua sendo Ajustes.
 */
export interface GastoQueRepete {
    descricao: string;
    valor: string;
    data: string;
    contaId: string;
    categoriaId: string;
    urgencia?: Urgencia;
}
export declare function contaRecorrenteDoGasto(g: GastoQueRepete): {
    nome: string;
    valor: string;
    dia: number;
    conta_id: string;
    categoria_id: string;
    urgencia: Urgencia;
} | {
    erro: string;
};
