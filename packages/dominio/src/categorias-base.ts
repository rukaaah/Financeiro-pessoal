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

export const GRUPOS_BASE: readonly GrupoBase[] = [
  { nome: "Essenciais", ordem: 1 },
  { nome: "Pessoal", ordem: 2 },
  { nome: "Financeiro", ordem: 3 },
  { nome: "Renda", ordem: 4 },
];

export const CATEGORIAS_BASE: readonly CategoriaBase[] = [
  { grupo: "Essenciais", nome: "Mercado", tipo: "expense" },
  { grupo: "Essenciais", nome: "Moradia", tipo: "expense" },
  { grupo: "Essenciais", nome: "Contas da casa", tipo: "expense" },
  { grupo: "Essenciais", nome: "Transporte", tipo: "expense" },
  { grupo: "Essenciais", nome: "Saúde", tipo: "expense" },
  { grupo: "Essenciais", nome: "Educação", tipo: "expense" },
  { grupo: "Pessoal", nome: "Restaurantes", tipo: "expense" },
  { grupo: "Pessoal", nome: "Lazer", tipo: "expense" },
  { grupo: "Pessoal", nome: "Assinaturas", tipo: "expense" },
  { grupo: "Pessoal", nome: "Vestuário", tipo: "expense" },
  { grupo: "Pessoal", nome: "Cuidados pessoais", tipo: "expense" },
  { grupo: "Pessoal", nome: "Presentes", tipo: "expense" },
  { grupo: "Financeiro", nome: "Tarifas bancárias", tipo: "expense" },
  { grupo: "Renda", nome: "Salário", tipo: "income" },
  { grupo: "Renda", nome: "Freelance", tipo: "income" },
];
