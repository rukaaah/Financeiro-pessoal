import pg from "pg";

/**
 * Roda uma vez antes dos testes de integração: dá ao papel `app` uma senha local para
 * os testes conectarem como ele. Uma vez só, porque dois ALTER ROLE ao mesmo tempo
 * dão "tuple concurrently updated". Vale só no Postgres descartável do Docker e do CI.
 */
export default async function () {
  const url = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("alter role app login password 'dev'");
  await c.end();
}
