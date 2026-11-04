-- Reverte a migration 009.

DROP TABLE IF EXISTS reconciliations;
DROP TABLE IF EXISTS goal_settings;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_finalidade_casa_com_sinal;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_finalidade_so_em_transferencia;
ALTER TABLE transactions DROP COLUMN IF EXISTS goal_movement;
DROP TYPE IF EXISTS goal_movement;
