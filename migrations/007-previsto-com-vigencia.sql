-- Migration 007 — previsto por categoria com vigência (ADR-019).
--
-- O previsto de um mês é: o ajuste daquele mês, se houver; senão, o padrão
-- vigente naquele mês. Mudar o padrão hoje não reescreve meses passados, como
-- `account_terms` não reescreve faturas antigas (ADR-005). Receita usa o mesmo
-- mecanismo: a "renda base" é a soma dos previstos das categorias de receita.

CREATE TABLE budget_templates (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    category_id uuid           NOT NULL,
    amount      numeric(14, 2) NOT NULL,
    valid_from  date           NOT NULL,
    created_at  timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT budget_templates_categoria_fk
        FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE,
    CONSTRAINT budget_templates_valor_positivo CHECK (amount >= 0),
    CONSTRAINT budget_templates_primeiro_dia CHECK (EXTRACT(DAY FROM valid_from) = 1),
    CONSTRAINT budget_templates_uma_vigencia_por_mes UNIQUE (category_id, valid_from)
);

COMMENT ON TABLE budget_templates IS
    'Previsto padrão de uma categoria, valendo a partir de valid_from até o próximo (ADR-019).';

CREATE TABLE budget_adjustments (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    category_id uuid           NOT NULL,
    month       date           NOT NULL,
    amount      numeric(14, 2) NOT NULL,
    created_at  timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT budget_adjustments_categoria_fk
        FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE,
    CONSTRAINT budget_adjustments_valor_positivo CHECK (amount >= 0),
    CONSTRAINT budget_adjustments_primeiro_dia CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT budget_adjustments_um_por_mes UNIQUE (category_id, month)
);

COMMENT ON TABLE budget_adjustments IS
    'Exceção do previsto num mês específico; ausente, vale o padrão (ADR-019).';

-- Previsto de cada categoria num mês. SECURITY INVOKER: a RLS das tabelas vale.
CREATE FUNCTION previsto_do_mes(p_mes date)
RETURNS TABLE (category_id uuid, previsto numeric(14, 2), ajustado boolean)
    LANGUAGE sql STABLE
    AS $$
    SELECT c.id,
           coalesce(a.amount, t.amount, 0)::numeric(14, 2),
           a.amount IS NOT NULL
      FROM categories c
      LEFT JOIN budget_adjustments a
             ON a.category_id = c.id AND a.month = date_trunc('month', p_mes)::date
      LEFT JOIN LATERAL (
            SELECT amount FROM budget_templates bt
             WHERE bt.category_id = c.id AND bt.valid_from <= date_trunc('month', p_mes)::date
             ORDER BY bt.valid_from DESC LIMIT 1
      ) t ON true
$$;

-- Mês de orçamento de uma despesa: o da fatura para cartão, o da data para o resto (ADR-005).
CREATE FUNCTION mes_do_orcamento(p_occurred_on date, p_invoice_month date) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT coalesce(p_invoice_month, date_trunc('month', p_occurred_on)::date) $$;

CREATE INDEX transactions_mes_do_orcamento
    ON transactions (user_id, mes_do_orcamento(occurred_on, invoice_month))
    WHERE kind IN ('income', 'expense');

ALTER TABLE budget_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_templates_isolamento ON budget_templates
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY budget_adjustments_isolamento ON budget_adjustments
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON budget_templates, budget_adjustments TO app;
GRANT EXECUTE ON FUNCTION previsto_do_mes(date), mes_do_orcamento(date, date) TO app;
