import { type Lancamento, type ListaDoMes } from "../api.ts";
export declare function Lancamentos({ lista, ocultos, aoEditar, aoAbrirLancar, aoColar, aoImportar }: {
    lista: ListaDoMes | null;
    ocultos: Set<string>;
    aoEditar(l: Lancamento): void;
    aoAbrirLancar(): void;
    aoColar(): void;
    aoImportar(): void;
}): import("preact").JSX.Element;
export declare function Editar({ l, aoFechar, aoSalvar, aoExcluir }: {
    l: Lancamento;
    aoFechar(): void;
    aoSalvar(corpo: object): void;
    aoExcluir(): void;
}): import("preact").JSX.Element;
