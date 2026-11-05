import { type ItemAtencao, type Mes, type Opcoes } from "../api.ts";
export declare const amanha: () => string;
export declare function ListaDeAtencao({ itens, limite, aoAgir, aoAdiar }: {
    itens: ItemAtencao[];
    limite?: number;
    aoAgir(i: ItemAtencao): void;
    aoAdiar?(i: ItemAtencao, ate: string | null): void;
}): import("preact").JSX.Element;
export declare function Atencao({ dados, aoFechar, aoAgir, aoAdiar, aoNovaConta }: {
    dados: Mes;
    aoFechar(): void;
    aoAgir(i: ItemAtencao): void;
    aoAdiar(i: ItemAtencao, ate: string | null): void;
    aoNovaConta(): void;
}): import("preact").JSX.Element;
export declare function SaldoProjetado({ dados }: {
    dados: Mes;
}): import("preact").JSX.Element | null;
export declare function NovaConta({ opcoes, aoFechar, aoSalvar }: {
    opcoes: Opcoes | null;
    aoFechar(): void;
    aoSalvar(corpo: object): void;
}): import("preact").JSX.Element;
export declare function Receber({ entrada, ptax, descontoPb, aoFechar, aoSalvar }: {
    entrada: {
        id: string;
        descricao: string;
        estimativa: string;
    };
    ptax: string | null;
    descontoPb: number;
    aoFechar(): void;
    aoSalvar(recebido: string): void;
}): import("preact").JSX.Element;
