import pg from "pg";
import type { Banco, Consulta, Linha } from "../src/banco.ts";

/**
 * Adapter de teste: o mesmo contrato do `bancoNeon`, sobre `pg`, contra o Postgres do
 * docker-compose. BEGIN, as consultas em ordem, COMMIT — o que o `transaction()` do
 * Neon faz do lado de lá.
 */
export function bancoPg(url: string): Banco & { fechar(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  return {
    async lote(consultas: readonly Consulta[]): Promise<Linha[][]> {
      const cliente = await pool.connect();
      try {
        await cliente.query("begin");
        const saida: Linha[][] = [];
        for (const c of consultas) saida.push((await cliente.query(c.texto, [...c.params])).rows);
        await cliente.query("commit");
        return saida;
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      } finally {
        cliente.release();
      }
    },
    fechar: () => pool.end(),
  };
}
