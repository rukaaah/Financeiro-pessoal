import { type Cartao as CartaoDados, type Compra, type Fatura, type Opcoes } from "../api.ts";
export declare function Cartao({ dados, aoPagar }: {
    dados: {
        cartoes: CartaoDados[];
        compras: Compra[];
    } | null;
    aoPagar(c: CartaoDados, f: Fatura): void;
}): import("preact").JSX.Element;
export declare function PagarFatura({ cartao, fatura, opcoes, aoFechar, aoPagar }: {
    cartao: CartaoDados;
    fatura: Fatura;
    opcoes: Opcoes | null;
    aoFechar(): void;
    aoPagar(corpo: {
        cartao_id: string;
        conta_id: string;
        mes: string;
        valor: string;
        data: string;
    }): void;
}): import("preact").JSX.Element;
