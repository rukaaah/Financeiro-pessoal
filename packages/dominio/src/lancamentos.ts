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

/** CSV para planilha brasileira: ponto e vírgula, vírgula decimal, BOM para o Excel abrir em UTF-8. */
export function csv(linhas: readonly (readonly string[])[]): string {
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + linhas.map((l) => l.map(campo).join(";")).join("\r\n") + "\r\n";
}
