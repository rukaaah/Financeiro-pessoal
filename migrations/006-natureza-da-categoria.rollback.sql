-- Reverte a migration 006. Escrito junto com o apply (ADR-006): o yoyo grava os
-- passos de rollback no momento do apply; criado depois, o rollback não reverte
-- nada e sai com código 0.

DROP TRIGGER IF EXISTS transactions_custeio ON transactions;
DROP FUNCTION IF EXISTS transactions_custeio_tg();
DROP FUNCTION IF EXISTS verifica_custeio(uuid);

DROP TRIGGER IF EXISTS accounts_cofrinho_em_uso ON accounts;
DROP FUNCTION IF EXISTS accounts_cofrinho_em_uso_tg();

DROP TRIGGER IF EXISTS categories_cofrinho ON categories;
DROP FUNCTION IF EXISTS categories_cofrinho_tg();

DROP TABLE IF EXISTS goal_contributions;
DROP FUNCTION IF EXISTS goal_contributions_conta_tg();
DROP FUNCTION IF EXISTS exige_cofrinho(uuid);

DROP INDEX IF EXISTS transactions_custeio;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_funds_expense_fk;
ALTER TABLE transactions DROP COLUMN IF EXISTS funds_expense_id;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_id;

DROP INDEX IF EXISTS categories_um_cofrinho_por_categoria;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_natureza_so_em_despesa;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_cofrinho_so_em_goal_backed;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_goal_fk;
ALTER TABLE categories DROP COLUMN IF EXISTS goal_account_id;
ALTER TABLE categories DROP COLUMN IF EXISTS nature;

DROP TYPE IF EXISTS category_nature;
