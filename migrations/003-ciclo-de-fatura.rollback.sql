-- Reverte a migration 003, voltando ao comportamento da 002.
-- Escrito junto com o apply (ADR-006).
--
-- O UPDATE que limpou o invoice_month das transferências não é desfeito: o
-- valor antigo estava errado (ADR-007) e recriá-lo exigiria recalcular pela
-- regra que a 003 removeu. Revertendo, novas transferências voltam a receber
-- invoice_month; as já existentes seguem com NULL.

DROP TRIGGER transactions_invoice_month ON transactions;

CREATE OR REPLACE FUNCTION invoice_month_for(
    p_account_id     uuid,
    p_occurred_on    date,
    p_installment_no smallint
) RETURNS date
    LANGUAGE plpgsql
    STABLE
    AS $$
DECLARE
    v_closing   smallint;
    v_due       smallint;
    v_mes_fecha date;
    v_mes_vence date;
BEGIN
    SELECT cycle_start_day, due_day
      INTO v_closing, v_due
      FROM account_terms
     WHERE account_id = p_account_id AND vigencia @> p_occurred_on;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem account_terms vigente para a conta % na data %',
            p_account_id, p_occurred_on USING ERRCODE = '23F01';
    END IF;

    v_mes_fecha := date_trunc('month', p_occurred_on)::date;
    IF EXTRACT(DAY FROM p_occurred_on) >= v_closing THEN
        v_mes_fecha := (v_mes_fecha + INTERVAL '1 month')::date;
    END IF;

    v_mes_vence := v_mes_fecha;
    IF v_due <= v_closing THEN
        v_mes_vence := (v_mes_vence + INTERVAL '1 month')::date;
    END IF;

    RETURN (v_mes_vence + make_interval(months => COALESCE(p_installment_no, 1) - 1))::date;
END
$$;

CREATE OR REPLACE FUNCTION transactions_invoice_month_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind     account_kind;
    v_esperado date;
BEGIN
    SELECT kind INTO v_kind FROM accounts WHERE id = NEW.account_id;

    IF v_kind = 'credit_card' THEN
        v_esperado := invoice_month_for(NEW.account_id, NEW.occurred_on, NEW.installment_no);
        IF NEW.invoice_month IS NULL THEN
            NEW.invoice_month := v_esperado;
        ELSIF NEW.invoice_month <> v_esperado THEN
            RAISE EXCEPTION 'invoice_month % não confere com o esperado % (ADR-005)',
                NEW.invoice_month, v_esperado USING ERRCODE = '23F02';
        END IF;
    ELSIF NEW.invoice_month IS NOT NULL THEN
        RAISE EXCEPTION 'invoice_month só existe em conta de cartão; esta é %', v_kind
            USING ERRCODE = '23F03';
    END IF;

    RETURN NEW;
END
$$;

CREATE TRIGGER transactions_invoice_month
    BEFORE INSERT OR UPDATE OF account_id, occurred_on, installment_no, invoice_month
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_invoice_month_tg();

COMMENT ON COLUMN account_terms.cycle_start_day IS NULL;
COMMENT ON COLUMN account_terms.due_day IS NULL;

ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_cycle_start_day_not_null TO account_terms_closing_day_not_null;
ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_cycle_start_day_valido TO account_terms_closing_day_valido;
ALTER TABLE account_terms RENAME COLUMN cycle_start_day TO closing_day;
