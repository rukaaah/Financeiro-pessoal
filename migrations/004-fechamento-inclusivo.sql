-- Migration 004 — o dia de fechamento é o do app do banco, e é inclusivo.
--
-- Implementa o ADR-008, que substitui a parte do ADR-007 sobre cycle_start_day.
-- A outra decisão daquele ADR (pagamento de fatura não tem invoice_month)
-- continua valendo e não é tocada aqui.
--
-- O ADR-007 pediu que o dono cadastrasse 28 num cartão anunciado como "fecha
-- dia 27". Era conversão desnecessária: gasto **até** o fechamento, inclusive,
-- entra na fatura atual; depois dele, na seguinte. Os dois números são os que
-- o banco mostra.

ALTER TABLE account_terms RENAME COLUMN cycle_start_day TO closing_day;

ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_cycle_start_day_valido TO account_terms_closing_day_valido;
ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_cycle_start_day_not_null TO account_terms_closing_day_not_null;

COMMENT ON COLUMN account_terms.closing_day IS
    'Dia do fechamento, exatamente como o app do banco informa. É inclusivo: '
    'a compra feita neste dia ainda entra na fatura que fecha hoje. Unicred 4, '
    'Nubank 27. Ver ADR-008.';

COMMENT ON COLUMN account_terms.due_day IS
    'Dia do vencimento, como o app do banco informa. Costuma ser de 7 a 10 dias '
    'após o fechamento; quando é menor que closing_day, a fatura vence no mês '
    'seguinte ao do fechamento (Nubank: fecha 27/09, vence 05/10).';

CREATE OR REPLACE FUNCTION invoice_month_for(
    p_account_id     uuid,
    p_occurred_on    date,
    p_installment_no smallint
) RETURNS date
    LANGUAGE plpgsql
    STABLE
    AS $$
DECLARE
    v_fechamento smallint;
    v_due        smallint;
    v_mes_fecha  date;
    v_mes_vence  date;
BEGIN
    SELECT closing_day, due_day
      INTO v_fechamento, v_due
      FROM account_terms
     WHERE account_id = p_account_id
       AND vigencia @> p_occurred_on;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'sem account_terms vigente para a conta % na data %',
            p_account_id, p_occurred_on
            USING ERRCODE = '23F01';
    END IF;

    -- Em que mês fecha a fatura desta compra? Gasto até o dia do fechamento,
    -- **inclusive**, entra na que fecha neste mês; depois dele, na do mês
    -- seguinte. É a diferença em relação à migration 003, que usava >=.
    v_mes_fecha := date_trunc('month', p_occurred_on)::date;
    IF EXTRACT(DAY FROM p_occurred_on) > v_fechamento THEN
        v_mes_fecha := (v_mes_fecha + INTERVAL '1 month')::date;
    END IF;

    -- E quando essa fatura vence? No mesmo mês em que fechou, se o vencimento
    -- vem depois do fechamento (Unicred: 11 > 4). No mês seguinte, se vier
    -- antes (Nubank: 5 < 27) — é por isso que o vencimento dele "pula" de mês.
    v_mes_vence := v_mes_fecha;
    IF v_due <= v_fechamento THEN
        v_mes_vence := (v_mes_vence + INTERVAL '1 month')::date;
    END IF;

    -- Cada parcela cai numa fatura adiante da anterior.
    RETURN (v_mes_vence
            + make_interval(months => COALESCE(p_installment_no, 1) - 1))::date;
END
$$;

COMMENT ON FUNCTION invoice_month_for(uuid, date, smallint) IS
    'Mês de vencimento da fatura em que a compra cai (ADR-005, com o '
    'fechamento inclusivo do ADR-008). Levanta 23F01 sem account_terms vigente.';
