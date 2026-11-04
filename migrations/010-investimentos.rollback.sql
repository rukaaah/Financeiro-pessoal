-- Reverte a migration 010.

DROP FUNCTION IF EXISTS tickers_em_carteira();
DROP TABLE IF EXISTS allocation_targets;
DROP TABLE IF EXISTS investment_rules;
DROP TABLE IF EXISTS asset_quotes;
DROP TABLE IF EXISTS asset_trades;
DROP TABLE IF EXISTS assets;
DROP TYPE IF EXISTS asset_class;
