import pg from "pg";

/**
 * Roda uma vez antes dos testes de integração: dá ao papel `app` uma senha local para
 * os testes conectarem como ele. Uma vez só, porque dois ALTER ROLE ao mesmo tempo
 * dão "tuple concurrently updated". Vale só no Postgres descartável do Docker e do CI.
 *
 * Também garante um usuário demo que nenhum arquivo apaga: quem está fora da allowlist
 * cai nele, e os testes não podem depender da ordem em que os arquivos rodam.
 */
export default async function () {
  const url = process.env.DATABASE_URL?.replace("postgresql+psycopg://", "postgresql://") ?? "postgresql://owner:dev@localhost:5433/financeiro";
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("alter role app login password 'dev'");
  if ((await c.query("select 1 from app_users where is_demo and active")).rowCount === 0)
    await c.query("insert into app_users (email, display_name, is_demo) values ('demo-fixo@teste.dev', 'Visitante', true)");
  await c.end();
}
