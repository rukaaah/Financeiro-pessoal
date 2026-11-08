-- Migration 016 — saldo inicial das contas (2026-11-08).
--
-- Um cofrinho criado pela leitura do extrato nasce só com os movimentos daquele
-- extrato: se ele já tinha R$ 1.000 e o extrato mostra um resgate de R$ 100, o
-- app mostra -R$ 100. O saldo inicial é o dinheiro que a conta já tinha antes do
-- primeiro lançamento registrado. Ele entra no saldo da conta, mas não é
-- lançamento: não conta como receita, gasto nem guardado de mês nenhum.
-- O app grava aqui a diferença entre o saldo real que a pessoa digita e a soma
-- dos lançamentos.

ALTER TABLE accounts
    ADD COLUMN opening_balance numeric(14,2) NOT NULL DEFAULT 0;
