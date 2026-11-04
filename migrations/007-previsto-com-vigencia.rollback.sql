-- Reverte a migration 007 (ADR-019).

DROP INDEX IF EXISTS transactions_mes_do_orcamento;
DROP FUNCTION IF EXISTS mes_do_orcamento(date, date);
DROP FUNCTION IF EXISTS previsto_do_mes(date);
DROP TABLE IF EXISTS budget_adjustments;
DROP TABLE IF EXISTS budget_templates;
