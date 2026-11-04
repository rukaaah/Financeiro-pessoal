/**
 * Porta de acesso ao Postgres (ADR-004, ADR-015).
 *
 * Toda ida ao banco é **um lote numa transação só**. A primeira consulta de todo lote
 * fixa `app.user_id` com `set_config(..., true)`, que vale só dentro da transação,
 * como o `SET LOCAL` da Fase 0. Não existe outro jeito de falar com o banco: quem
 * esquece o contexto recebe zero linhas, nunca as de outra pessoa.
 */

export interface Consulta {
  readonly texto: string;
  readonly params: readonly unknown[];
}

export type Linha = Record<string, unknown>;

export interface Banco {
  /** Executa as consultas em ordem, numa transação, e devolve as linhas de cada uma. */
  lote(consultas: readonly Consulta[]): Promise<Linha[][]>;
}

export const consulta = (texto: string, ...params: unknown[]): Consulta => ({ texto, params });
