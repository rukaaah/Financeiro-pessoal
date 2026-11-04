-- Migration 009 — cofrinhos com meta, finalidade do resgate e conciliação (RF14, RF18, ideia 8).
--
-- Resgate de cofrinho tem finalidade: usado no objetivo, empréstimo (fica "a
-- devolver") ou retirada definitiva. Aporte só abate dívida quando marcado como
-- devolução (RF18). A finalidade mora na perna da transferência que mexe no cofrinho.

CREATE TYPE goal_movement AS ENUM ('use', 'loan', 'withdrawal', 'repayment');

ALTER TABLE transactions ADD COLUMN goal_movement goal_movement;
ALTER TABLE transactions
    ADD CONSTRAINT transactions_finalidade_so_em_transferencia
    CHECK (goal_movement IS NULL OR kind = 'transfer'),
    ADD CONSTRAINT transactions_finalidade_casa_com_sinal
    CHECK (goal_movement IS NULL
           OR (goal_movement = 'repayment' AND amount > 0)
           OR (goal_movement IN ('use', 'loan', 'withdrawal') AND amount < 0));

COMMENT ON COLUMN transactions.goal_movement IS
    'Na perna que mexe no cofrinho: saída com finalidade (use, loan, withdrawal) ou entrada que devolve um empréstimo (repayment). RF18.';

CREATE TABLE goal_settings (
    account_id   uuid           PRIMARY KEY,
    user_id      uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    target       numeric(14, 2),
    target_date  date,
    started_on   date           NOT NULL DEFAULT current_date,
    cdi_percent  numeric(6, 2),
    created_at   timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT goal_settings_conta_fk
        FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE,
    CONSTRAINT goal_settings_meta_positiva CHECK (target IS NULL OR target > 0),
    CONSTRAINT goal_settings_cdi CHECK (cdi_percent IS NULL OR cdi_percent BETWEEN 0 AND 300),
    CONSTRAINT goal_settings_datas CHECK (target_date IS NULL OR target_date > started_on)
);

CREATE TABLE reconciliations (
    id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    account_id    uuid           NOT NULL,
    reconciled_on date           NOT NULL,
    bank_balance  numeric(14, 2) NOT NULL,
    app_balance   numeric(14, 2) NOT NULL,
    created_at    timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT reconciliations_conta_fk
        FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE
);

ALTER TABLE goal_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_settings_isolamento ON goal_settings
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY reconciliations_isolamento ON reconciliations
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON goal_settings, reconciliations TO app;
