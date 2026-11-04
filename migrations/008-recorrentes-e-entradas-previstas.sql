-- Migration 008 — contas recorrentes, entradas previstas e a aba Atenção (RF20, ideias 6, 7 e 21).
--
-- Conta recorrente: o que se paga todo mês, com urgência. Paga no mês quando existe
-- lançamento apontando para ela naquele mês do orçamento; até lá entra em "a pagar".
-- Entrada prevista: dinheiro que vai chegar numa data (o freelance em dólar). Ao
-- receber vira receita pelo valor em reais que chegou, e o desconto do PayPal contra a
-- PTAX fica guardado (ideia 21).

CREATE TYPE bill_urgency AS ENUM ('essential', 'important', 'deferrable');

CREATE TABLE recurring_bills (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    name        text           NOT NULL,
    amount      numeric(14, 2) NOT NULL,
    due_day     smallint       NOT NULL,
    category_id uuid           NOT NULL,
    account_id  uuid           NOT NULL,
    urgency     bill_urgency   NOT NULL DEFAULT 'important',
    varies      boolean        NOT NULL DEFAULT false,
    valid_from  date           NOT NULL,
    valid_until date,
    created_at  timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT recurring_bills_nome_nao_vazio CHECK (length(btrim(name)) > 0),
    CONSTRAINT recurring_bills_valor_positivo CHECK (amount > 0),
    CONSTRAINT recurring_bills_dia_valido CHECK (due_day BETWEEN 1 AND 31),
    CONSTRAINT recurring_bills_vigencia CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT recurring_bills_user_id_id UNIQUE (user_id, id),
    CONSTRAINT recurring_bills_categoria_fk
        FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE RESTRICT,
    CONSTRAINT recurring_bills_conta_fk
        FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE RESTRICT
);

ALTER TABLE transactions ADD COLUMN recurring_bill_id uuid;
ALTER TABLE transactions
    ADD CONSTRAINT transactions_recurring_bill_fk
    FOREIGN KEY (user_id, recurring_bill_id) REFERENCES recurring_bills (user_id, id) ON DELETE SET NULL (recurring_bill_id);

CREATE TABLE expected_incomes (
    id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    description     text           NOT NULL,
    currency        text           NOT NULL DEFAULT 'BRL',
    amount          numeric(14, 2) NOT NULL,
    expected_on     date           NOT NULL,
    account_id      uuid           NOT NULL,
    category_id     uuid           NOT NULL,
    transaction_id  uuid,
    received_brl    numeric(14, 2),
    reference_rate  numeric(12, 5),
    fee_brl         numeric(14, 2),
    created_at      timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT expected_incomes_moeda CHECK (currency IN ('BRL', 'USD')),
    CONSTRAINT expected_incomes_valor_positivo CHECK (amount > 0),
    CONSTRAINT expected_incomes_recebido_completo CHECK (
        (transaction_id IS NULL) = (received_brl IS NULL)
    ),
    CONSTRAINT expected_incomes_conta_fk
        FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE RESTRICT,
    CONSTRAINT expected_incomes_categoria_fk
        FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE RESTRICT
);

COMMENT ON COLUMN expected_incomes.fee_brl IS
    'Quanto o intermediário (PayPal) ficou: amount × reference_rate (PTAX de venda do dia) − received_brl.';

-- "Lembrar amanhã" e "Resolvido" de um item da Atenção. A chave é a do item
-- calculado (ex.: conta:<id>:2026-11), não uma linha de outra tabela.
CREATE TABLE attention_snoozes (
    user_id   uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    item_key  text        NOT NULL,
    until     date,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

COMMENT ON COLUMN attention_snoozes.until IS 'Escondido até esta data; NULL é resolvido de vez.';

ALTER TABLE recurring_bills   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expected_incomes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_snoozes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_bills_isolamento ON recurring_bills
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY expected_incomes_isolamento ON expected_incomes
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY attention_snoozes_isolamento ON attention_snoozes
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_bills, expected_incomes, attention_snoozes TO app;
