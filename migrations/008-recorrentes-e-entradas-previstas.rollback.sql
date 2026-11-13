-- Reverte a migration 008.

DROP TABLE IF EXISTS attention_snoozes;
DROP TABLE IF EXISTS expected_incomes;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_recurring_bill_fk;
ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_bill_id;
DROP TABLE IF EXISTS recurring_bills;
DROP TYPE IF EXISTS bill_urgency;
