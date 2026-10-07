-- Migration 003 — ciclo da fatura pelo dia de início, e pagamento fora da fatura.
--
-- Implementa o ADR-007, que refina o ADR-005. Dois problemas encontrados ao
-- montar os dados do modo demo:
--
-- 1. `closing_day` não dizia se o dia informado era o último do ciclo velho ou
--    o primeiro do ciclo novo. Os dois cartões reais do dono são descritos de
--    maneiras diferentes (Unicred "fecha 04" = primeiro dia do ciclo novo;
--    Nubank "fecha 27" = último dia do ciclo velho), e a diferença é de um mês
--    inteiro no orçamento.
-- 2. O pagamento da fatura, que é perna de transferência na conta do cartão,
--    recebia invoice_month pela regra de compra — com o mês errado, e
--    poluindo o total da fatura a ponto de deixá-lo positivo.

ALTER TABLE account_terms RENAME COLUMN closing_day TO cycle_start_day;

ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_closing_day_valido TO account_terms_cycle_start_day_valido;

-- O PostgreSQL 18 nomeia também as restrições NOT NULL, e o nome não acompanha
-- o RENAME COLUMN. Sem isto, `closing_day` sobreviveria no schema.sql.
ALTER TABLE account_terms
    RENAME CONSTRAINT account_terms_closing_day_not_null TO account_terms_cycle_start_day_not_null;

COMMENT ON COLUMN account_terms.cycle_start_day IS
    'Dia em que uma fatura nova começa a acumular. NÃO é o número que o banco '
    'imprime como "fechamento": no Unicred (ciclo 04→03) cadastra-se 4, e no '
    'Nubank (ciclo 28→27, anunciado como "fecha 27") cadastra-se 28. Ver ADR-007.';

COMMENT ON COLUMN account_terms.due_day IS
    'Dia do vencimento. Se for menor que cycle_start_day, a fatura vence no mês '
    'seguinte ao do fim do ciclo (caso Nubank: fecha 27/10, vence 05/11).';

-- ---------------------------------------------------------------- cálculo

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
    SELECT cycle_start_day, due_day
      INTO v_inicio, v_due
      FROM account_terms
     WHERE account_id = p_account_id
       AND vigencia @> p_occurred_on;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'sem account_terms vigente para a conta % na data %',
            p_account_id, p_occurred_on
            USING ERRCODE = '23F01';
    END IF;

    -- Em que mês termina o ciclo que contém esta compra?
    -- O ciclo começa no dia cycle_start_day e termina no dia anterior, do mês
    -- seguinte. Logo, compra a partir do dia de início pertence ao ciclo que
    -- termina no mês seguinte; antes dele, ao ciclo que termina neste mês.
    v_mes_fecha := date_trunc('month', p_occurred_on)::date;
    IF EXTRACT(DAY FROM p_occurred_on) >= v_inicio THEN
        v_mes_fecha := (v_mes_fecha + INTERVAL '1 month')::date;
    END IF;

    -- E quando essa fatura vence? No mesmo mês em que o ciclo terminou, se o
    -- dia de vencimento vem depois do início do ciclo (Unicred: 11 >= 4). No
    -- mês seguinte, se vier antes (Nubank: 5 < 28).
    v_mes_vence := v_mes_fecha;
    IF v_due < v_inicio THEN
        v_mes_vence := (v_mes_vence + INTERVAL '1 month')::date;
    END IF;

    -- Cada parcela cai numa fatura adiante da anterior.
    RETURN (v_mes_vence
            + make_interval(months => COALESCE(p_installment_no, 1) - 1))::date;
END
$$;

COMMENT ON FUNCTION invoice_month_for(uuid, date, smallint) IS
    'Mês de vencimento da fatura em que a compra cai (ADR-005, refinado pelo '
    'ADR-007). Levanta 23F01 se não houver account_terms vigente na data.';

-- ---------------------------------------------------------------- trigger

CREATE OR REPLACE FUNCTION transactions_invoice_month_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind     account_kind;
    v_esperado date;
BEGIN
    SELECT kind INTO v_kind FROM accounts WHERE id = NEW.account_id;

    -- Perna de transferência numa conta de cartão é pagamento de fatura (ou
    -- estorno): move dinheiro, não é compra, e por isso não pertence a fatura
    -- nenhuma. Sem esta exceção, `sum(amount) GROUP BY invoice_month` mistura
    -- compras com pagamento e deixa de significar o total da fatura (ADR-007).
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

-- O trigger precisa disparar também quando `kind` muda, para que uma linha não
-- vire transferência carregando o invoice_month que tinha como despesa.
DROP TRIGGER transactions_invoice_month ON transactions;
CREATE TRIGGER transactions_invoice_month
    BEFORE INSERT OR UPDATE OF kind, account_id, occurred_on, installment_no, invoice_month
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_invoice_month_tg();

-- Limpa o que a regra antiga gravou nas pernas de transferência.
UPDATE transactions SET invoice_month = NULL
 WHERE kind = 'transfer' AND invoice_month IS NOT NULL;
