-- Reverte a migration 004, voltando ao cycle_start_day do ADR-007.
-- Escrito junto com o apply (ADR-006).

CREATE OR REPLACE FUNCTION invoice_month_for(
    p_account_id     uuid,
    p_occurred_on    date,
    p_installment_no smallint
) RETURNS date
    LANGUAGE plpgsql
    STABLE
    AS $$
DECLARE
    v_inicio    smallint;
    v_due       smallint;
    v_mes_fecha date;
    v_mes_vence date;
BEGIN
    SELECT closing_day, due_day
      INTO v_inicio, v_due
      FROM account_terms
     WHERE account_id = p_account_id AND vigencia @> p_occurred_on;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'sem account_terms vigente para a conta % na data %',
            p_account_id, p_occurred_on USING ERRCODE = '23F01';
    END IF;

    v_mes_fecha := date_trunc('month', p_occurred_on)::date;
    IF EXTRACT(DAY FROM p_occurred_on) >= v_inicio THEN
        v_mes_fecha := (v_mes_fecha + INTERVAL '1 month')::date;
    END IF;

    v_mes_vence := v_mes_fecha;
    IF v_due < v_inicio THEN
        v_mes_vence := (v_mes_vence + INTERVAL '1 month')::date;
    END IF;

    RETURN (v_mes_vence + make_interval(months => COALESCE(p_installment_no, 1) - 1))::date;
END
$$;

COMMENT ON COLUMN account_terms.closing_day IS NULL;
COMMENT ON COLUMN account_terms.due_day IS NULL;

ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_closing_day_not_null TO account_terms_cycle_start_day_not_null;
ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_closing_day_valido TO account_terms_cycle_start_day_valido;
ALTER TABLE account_terms RENAME COLUMN closing_day TO cycle_start_day;
