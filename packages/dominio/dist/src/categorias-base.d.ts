/**
 * Categorias base: o conjunto com que uma conta real começa na primeira entrada, e o
 * mesmo do demo. A cópia em Python é `GRUPOS` e `CATEGORIAS` em `scripts/seed_demo.py`;
 * `tests/unit/test_categorias_base.py` confere que as duas listas são iguais.
 *
 * Uma linha por grupo e por categoria, sempre neste formato: o teste do Python lê este
 * arquivo como texto.
 */
export interface GrupoBase {
    readonly nome: string;
    readonly ordem: number;
}
export interface CategoriaBase {
    readonly grupo: string;
    readonly nome: string;
    readonly tipo: "income" | "expense";
}
export declare const GRUPOS_BASE: readonly GrupoBase[];
export declare const CATEGORIAS_BASE: readonly CategoriaBase[];
