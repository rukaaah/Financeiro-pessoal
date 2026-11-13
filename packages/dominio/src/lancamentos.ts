import type { Centavos } from "./dinheiro.ts";

/**
 * Lançar por intenção (ADR-011, decisão 5): a pessoa diz o que aconteceu; o sinal, o
 * tipo e as parcelas saem daqui. O banco confere de novo (CHECKs e triggers).
 */

export type Intencao = "gastei" | "recebi";
export type Tipo = "expense" | "income";

export interface NovoLancamento {
  readonly intencao: Intencao;
  readonly valor: Centavos;
  readonly contaId: string;
  readonly categoriaId: string;
  readonly data: string; // AAAA-MM-DD
  readonly descricao: string;
  readonly parcelas: number;
}

export interface LinhaParaGravar {
  readonly tipo: Tipo;
  readonly valor: Centavos; // com sinal
  readonly parcela: number | null;
  readonly totalDeParcelas: number | null;
}

export class LancamentoInvalido extends Error {}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Divide o total em n parcelas que somam exatamente o total; o centavo que sobra vai na primeira. */
export function parcelar(total: Centavos, n: number): Centavos[] {
  if (!Number.isInteger(n) || n < 1) throw new LancamentoInvalido("número de parcelas inválido");
  const base = total / BigInt(n);
  const resto = total - base * BigInt(n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

export function linhasDe(l: NovoLancamento): LinhaParaGravar[] {
  if (l.valor <= 0n) throw new LancamentoInvalido("O valor precisa ser maior que zero.");
  if (!DATA.test(l.data) || Number.isNaN(Date.parse(l.data))) throw new LancamentoInvalido("Data inválida.");
  if (l.parcelas < 1 || l.parcelas > 48) throw new LancamentoInvalido("Parcelas de 1 a 48.");
  if (l.intencao === "recebi" && l.parcelas > 1) throw new LancamentoInvalido("Receita não tem parcelas.");
  const tipo: Tipo = l.intencao === "gastei" ? "expense" : "income";
  const sinal = tipo === "expense" ? -1n : 1n;
  if (l.parcelas === 1) return [{ tipo, valor: sinal * l.valor, parcela: null, totalDeParcelas: null }];
  return parcelar(l.valor, l.parcelas).map((v, i) => ({ tipo, valor: sinal * v, parcela: i + 1, totalDeParcelas: l.parcelas }));
}

/** Tipos de conta onde um gasto ou uma receita podem estar (os mesmos do Lançar). */
export const CONTAS_DE_LANCAMENTO = ["checking", "credit_card", "cash"] as const;

export interface Edicao {
  readonly tipo: Tipo;
  readonly valor: Centavos; // total da compra, positivo
  readonly data: string; // AAAA-MM-DD; numa compra parcelada, a data da compra
  readonly parcelas: number;
  readonly tipoDaConta: string;
}

/**
 * Edição de gasto ou receita, inclusive compra parcelada (que se edita inteira).
 * Devolve as linhas que o lançamento passa a ter, com as mesmas regras do Lançar:
 * parcela só no cartão, receita fora do cartão.
 */
export function linhasDaEdicao(e: Edicao): LinhaParaGravar[] {
  if (!(CONTAS_DE_LANCAMENTO as readonly string[]).includes(e.tipoDaConta)) throw new LancamentoInvalido("Escolha uma conta, cartão ou dinheiro.");
  if (e.tipo === "income" && e.tipoDaConta === "credit_card") throw new LancamentoInvalido("Receita não entra no cartão.");
  if (e.parcelas > 1 && e.tipoDaConta !== "credit_card") throw new LancamentoInvalido("Parcelas só no cartão.");
  return linhasDe({ intencao: e.tipo === "expense" ? "gastei" : "recebi", valor: e.valor, contaId: "", categoriaId: "", data: e.data, descricao: "", parcelas: e.parcelas });
}

/** Edição de transferência: as duas pernas mudam juntas e continuam somando zero. */
export function conferirTransferencia(t: { valor: Centavos; data: string; origem: string; destino: string }): void {
  if (t.valor <= 0n) throw new LancamentoInvalido("O valor precisa ser maior que zero.");
  if (!DATA.test(t.data) || Number.isNaN(Date.parse(t.data))) throw new LancamentoInvalido("Data inválida.");
  if (t.origem === t.destino) throw new LancamentoInvalido("Origem e destino precisam ser contas diferentes.");
}

/** CSV para planilha brasileira: ponto e vírgula, vírgula decimal, BOM para o Excel abrir em UTF-8. */
export function csv(linhas: readonly (readonly string[])[]): string {
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + linhas.map((l) => l.map(campo).join(";")).join("\r\n") + "\r\n";
}
