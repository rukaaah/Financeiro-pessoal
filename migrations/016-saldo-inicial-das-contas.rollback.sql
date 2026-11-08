-- Rollback da 016: o saldo inicial some e os saldos voltam a ser só a soma dos lançamentos.
ALTER TABLE accounts DROP COLUMN opening_balance;
