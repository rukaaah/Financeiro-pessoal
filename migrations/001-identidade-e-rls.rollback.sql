-- Reverte a migration 001.
-- Escrito junto com o apply: o yoyo grava os passos de rollback no momento em
-- que aplica, então um arquivo criado depois seria ignorado (ADR-006).

DROP FUNCTION IF EXISTS demo_app_user();
DROP FUNCTION IF EXISTS resolve_app_user(text);
DROP TABLE IF EXISTS app_users;
DROP FUNCTION IF EXISTS current_app_user();

REVOKE USAGE ON SCHEMA public FROM app, jobs;

-- Os papéis não são removidos: são objetos de cluster, podem ser donos de
-- conexões abertas e, no Neon, podem ter sido criados pelo console. Derrubá-los
-- num rollback causaria mais estrago do que repara.
