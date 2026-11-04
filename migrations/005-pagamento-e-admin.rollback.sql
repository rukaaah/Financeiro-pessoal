-- Reverte a migration 005. Escrito junto com o apply (ADR-006): o yoyo grava os
-- passos de rollback no momento em que aplica, e um .rollback.sql criado depois
-- não reverte nada e sai com código 0.

-- ============================================================================
-- 2. Quem administra a allowlist
-- ============================================================================

DROP FUNCTION IF EXISTS admin_list_app_users();

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_demo_nao_administra;
ALTER TABLE app_users DROP COLUMN IF EXISTS is_admin;

-- ============================================================================
-- 1. A perna de pagamento aponta a fatura que quita
-- ============================================================================

-- Volta o trigger ao estado da migration 003/004: sem a vigilância de
-- settles_invoice_month, e sem `amount` na lista de colunas.
DROP TRIGGER IF EXISTS transactions_invoice_month ON transactions;
CREATE TRIGGER transactions_invoice_month
    BEFORE INSERT OR UPDATE OF kind, account_id, occurred_on, installment_no, invoice_month
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_invoice_month_tg();

CREATE OR REPLACE FUNCTION transactions_invoice_month_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind     account_kind;
    v_esperado date;
BEGIN
    SELECT kind INTO v_kind FROM accounts WHERE id = NEW.account_id;

    IF NEW.kind = 'transfer' THEN
        IF NEW.invoice_month IS NOT NULL THEN
            RAISE EXCEPTION
                'transferência não tem mês de fatura: pagamento não é compra (ADR-007)'
                USING ERRCODE = '23F04';
        END IF;
        RETURN NEW;
    END IF;

    IF v_kind = 'credit_card' THEN
        v_esperado := invoice_month_for(
            NEW.account_id, NEW.occurred_on, NEW.installment_no
        );

        IF NEW.invoice_month IS NULL THEN
            NEW.invoice_month := v_esperado;
        ELSIF NEW.invoice_month <> v_esperado THEN
            RAISE EXCEPTION
                'invoice_month % não confere com o esperado % (ADR-005)',
                NEW.invoice_month, v_esperado
                USING ERRCODE = '23F02';
        END IF;
    ELSIF NEW.invoice_month IS NOT NULL THEN
        RAISE EXCEPTION
            'invoice_month só existe em conta de cartão; esta é %', v_kind
            USING ERRCODE = '23F03';
    END IF;

    RETURN NEW;
END
$$;

COMMENT ON FUNCTION transactions_invoice_month_tg() IS
    'Calcula e verifica invoice_month (ADR-005, com o fechamento inclusivo do '
    'ADR-008).';

DROP INDEX IF EXISTS transactions_user_quita;

ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_settles_invoice_month_e_primeiro_dia;
ALTER TABLE transactions DROP COLUMN IF EXISTS settles_invoice_month;
