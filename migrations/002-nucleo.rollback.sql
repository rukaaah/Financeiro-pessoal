-- Reverte a migration 002. Escrito junto com o apply (ADR-006).

DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS category_groups;
DROP TABLE IF EXISTS account_terms;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS counterparties;

DROP FUNCTION IF EXISTS transactions_transfer_soma_zero_tg();
DROP FUNCTION IF EXISTS transactions_invoice_month_tg();
DROP FUNCTION IF EXISTS invoice_month_for(uuid, date, smallint);

DROP TYPE IF EXISTS category_kind;
DROP TYPE IF EXISTS transaction_kind;
DROP TYPE IF EXISTS account_kind;

-- btree_gist não é removida: outra migration pode passar a depender dela.
