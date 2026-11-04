import { neon } from "@neondatabase/serverless";
import type { Banco, Consulta, Linha } from "./banco.ts";

/**
 * Adapter de produção: driver serverless do Neon por HTTP. O `transaction()` roda o
 * lote numa transação não interativa, numa única ida e volta.
 */
export function bancoNeon(url: string): Banco {
  const sql = neon(url);
  return {
    async lote(consultas: readonly Consulta[]): Promise<Linha[][]> {
      const resultados = await sql.transaction(
        consultas.map((c) => sql.query(c.texto, [...c.params])),
      );
      return resultados as Linha[][];
    },
  };
}
