import { type Centavos } from "./dinheiro.ts";
/**
 * Entrada em lote (fatia 8): colar notificação ou SMS do banco (ideia 11), linhas de
 * extrato (RF05) e categoria sugerida pelo histórico (ideia 13). Tudo por regra; a IA
 * só entra como reserva, na fatia 9, quando a regra não reconhece.
 */
export interface LidoDaNotificacao {
    readonly valor: Centavos;
    readonly data: string | null;
    readonly estabelecimento: string | null;
    readonly sentido: "saida" | "entrada";
    readonly noCartao: boolean;
    readonly parcelas: number | null;
}
/** Lê o que importa de uma notificação de compra, PIX ou transferência. Null se não houver valor. */
export declare function lerNotificacao(texto: string, hoje: string): LidoDaNotificacao | null;
/** Maiúsculas, sem números de terminal, sem prefixos de adquirente (PAG*, MP*, IFD*). */
export declare function normalizarEstabelecimento(nome: string): string;
export interface LinhaDeExtrato {
    readonly data: string;
    readonly descricao: string;
    readonly valor: Centavos;
}
export interface ExtratoLido {
    readonly linhas: LinhaDeExtrato[];
    readonly saldos: {
        data: string;
        saldo: Centavos;
    }[];
    readonly ignoradas: number;
}
/**
 * Lê o texto de um extrato, uma movimentação por linha ("dd/mm/aaaa descrição -R$ 42,50")
 * e os saldos diários impressos ("dd/mm/aaaa Saldo do dia R$ 1.840,35"). O formato exato
 * do PDF do PicPay ainda precisa ser conferido com um extrato de exemplo.
 */
export declare function lerExtrato(texto: string): ExtratoLido;
/** Confere cada saldo impresso contra o saldo anterior mais as linhas do dia. Devolve os dias que não fecham. */
export declare function conferirSaldos(lido: ExtratoLido, saldoAnterior: Centavos): {
    data: string;
    esperado: Centavos;
    impresso: Centavos;
}[];
/** Impressão digital para deduplicar: data, valor e descrição normalizada. */
export declare const chaveDeDuplicidade: (l: {
    data: string;
    valor: Centavos;
    descricao: string;
}) => string;
