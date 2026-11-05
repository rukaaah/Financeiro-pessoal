import { type CategoriaDoMes, type Mes as MesDados } from "../api.ts";
import type { ItemAtencao } from "../api.ts";
export declare const nomeDoMes: (m: string) => string;
export declare const andarMes: (m: string, d: number) => string;
export declare function Mes({ mes, dados, aoTrocarMes, aoAbrirCategoria, aoVerAtencao, aoAgir, aoPerguntar }: {
    mes: string;
    dados: MesDados | null;
    aoTrocarMes(m: string): void;
    aoAbrirCategoria(c: CategoriaDoMes): void;
    aoVerAtencao(): void;
    aoAgir(i: ItemAtencao): void;
    aoPerguntar(): void;
}): import("preact").JSX.Element;
export declare function DetalheDaCategoria({ c, mes, aoFechar, aoSalvar, aoPerguntar }: {
    c: CategoriaDoMes;
    mes: string;
    aoFechar(): void;
    aoSalvar(valor: string, padrao: boolean): void;
    aoPerguntar(): void;
}): import("preact").JSX.Element;
