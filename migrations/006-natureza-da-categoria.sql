-- Migration 006 — natureza da categoria e a categoria com cofrinho (ADR-014).
--
-- Aditiva: toda categoria existente nasce `variable`, nenhum lançamento aponta
-- despesa, e o app que está no ar não precisa conhecer nada disto.
--
--   1. categories.nature + categories.goal_account_id
--   2. goal_contributions: inserção mensal prevista do cofrinho, com vigência
--   3. transactions.funds_expense_id: o resgate do cofrinho aponta a despesa
--      que pagou
--
-- SQLSTATE novos, na classe 23 pelo motivo registrado na migration 002:
--
--   23F20  cofrinho que não é conta `goal` (ou deixa de ser)
--   23F21  quem aponta despesa não é perna de saída de conta `goal`
--   23F22  despesa apontada não é de categoria com este cofrinho
--   23F23  resgates que pagam mais que a despesa
--   23F24  categoria perde o cofrinho tendo despesa paga por ele

-- ============================================================================
-- 1. Natureza da categoria
-- ============================================================================

CREATE TYPE category_nature AS ENUM (
    'variable',     -- o que sobra é dinheiro livre: entra em "Onde ainda cabe"
    'fixed',        -- mesmo valor todo mês (mensalidade): não é folga
    'goal_backed'   -- tem um cofrinho que paga os gastos dela
);

ALTER TABLE categories
    ADD COLUMN nature          category_nature NOT NULL DEFAULT 'variable',
    ADD COLUMN goal_account_id uuid;

COMMENT ON COLUMN categories.nature IS
    'Natureza da categoria (ADR-014). Decide se ela aparece em "Onde ainda cabe" '
    'e como o Resumo a lê. Só despesa foge de variable.';
COMMENT ON COLUMN categories.goal_account_id IS
    'Cofrinho que paga os gastos desta categoria. Existe se, e só se, '
    'nature = goal_backed (ADR-014).';

ALTER TABLE categories
    -- FK composta pelo mesmo motivo de accounts_counterparty_fk (migration 002).
    ADD CONSTRAINT categories_goal_fk
        FOREIGN KEY (user_id, goal_account_id)
        REFERENCES accounts (user_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT categories_cofrinho_so_em_goal_backed
        CHECK ((nature = 'goal_backed') = (goal_account_id IS NOT NULL)),
    ADD CONSTRAINT categories_natureza_so_em_despesa
        CHECK (kind = 'expense' OR nature = 'variable');

-- Um cofrinho atende no máximo uma categoria: é o que deixa atribuir uma
-- inserção no cofrinho à categoria sem ambiguidade.
CREATE UNIQUE INDEX categories_um_cofrinho_por_categoria
    ON categories (goal_account_id)
    WHERE goal_account_id IS NOT NULL;

-- ============================================================================
-- 2. Inserção mensal prevista, com vigência
-- ============================================================================
--
-- Mesmo molde de account_terms: mudar o valor hoje não reescreve os meses em
-- que o valor era outro (ADR-005, ADR-014).

CREATE TABLE goal_contributions (
    id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    account_id uuid           NOT NULL,
    vigencia   daterange      NOT NULL,
    amount     numeric(14, 2) NOT NULL,
    created_at timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT goal_contributions_account_fk
        FOREIGN KEY (user_id, account_id)
        REFERENCES accounts (user_id, id) ON DELETE CASCADE,
    CONSTRAINT goal_contributions_valor_positivo CHECK (amount > 0),
    CONSTRAINT goal_contributions_vigencia_nao_vazia CHECK (NOT isempty(vigencia)),
    CONSTRAINT goal_contributions_sem_sobreposicao
        EXCLUDE USING gist (account_id WITH =, vigencia WITH &&)
);

COMMENT ON TABLE goal_contributions IS
    'Quanto do salário vai para o cofrinho por mês, com vigência (ADR-014).';

-- ============================================================================
-- 3. O resgate aponta a despesa que pagou
-- ============================================================================

-- Alvo da FK composta abaixo.
ALTER TABLE transactions
    ADD CONSTRAINT transactions_user_id_id UNIQUE (user_id, id);

ALTER TABLE transactions
    ADD COLUMN funds_expense_id uuid,
    -- RESTRICT de propósito: apagar só a despesa deixaria dinheiro saído do
    -- cofrinho sem destino.
    ADD CONSTRAINT transactions_funds_expense_fk
        FOREIGN KEY (user_id, funds_expense_id)
        REFERENCES transactions (user_id, id) ON DELETE RESTRICT;

COMMENT ON COLUMN transactions.funds_expense_id IS
    'Na perna de saída de um cofrinho: a despesa que este resgate pagou '
    '(modalidade "do cofrinho", ADR-014). Nulo em todo o resto.';

CREATE INDEX transactions_custeio
    ON transactions (funds_expense_id)
    WHERE funds_expense_id IS NOT NULL;

-- ============================================================================
-- Invariantes
-- ============================================================================
--
-- SECURITY DEFINER pelo motivo de transactions_transfer_soma_zero_tg: o
-- invariante não pode depender do que a RLS mostra a quem pergunta.

CREATE FUNCTION exige_cofrinho(p_account_id uuid) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
DECLARE
    v_kind account_kind;
BEGIN
    SELECT kind INTO v_kind FROM public.accounts WHERE id = p_account_id;
    IF v_kind IS DISTINCT FROM 'goal' THEN
        RAISE EXCEPTION 'a conta % não é cofrinho (é %)', p_account_id, v_kind
            USING ERRCODE = '23F20';
    END IF;
END
$$;

-- ---------------------------------------------------------------- categorias

CREATE FUNCTION categories_cofrinho_tg() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
BEGIN
    IF NEW.goal_account_id IS NOT NULL THEN
        PERFORM public.exige_cofrinho(NEW.goal_account_id);
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.goal_account_id IS NOT NULL
       AND NEW.goal_account_id IS DISTINCT FROM OLD.goal_account_id
       AND EXISTS (
           SELECT 1
             FROM public.transactions d
             JOIN public.transactions r ON r.funds_expense_id = d.id
            WHERE d.category_id = OLD.id
       ) THEN
        RAISE EXCEPTION
            'a categoria % tem despesa paga pelo cofrinho; não pode trocar de cofrinho',
            OLD.id
            USING ERRCODE = '23F24';
    END IF;

    RETURN NEW;
END
$$;

CREATE TRIGGER categories_cofrinho
    BEFORE INSERT OR UPDATE OF nature, goal_account_id ON categories
    FOR EACH ROW EXECUTE FUNCTION categories_cofrinho_tg();

-- ------------------------------------------------------- goal_contributions

CREATE FUNCTION goal_contributions_conta_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM exige_cofrinho(NEW.account_id);
    RETURN NEW;
END
$$;

CREATE TRIGGER goal_contributions_conta
    BEFORE INSERT OR UPDATE OF account_id ON goal_contributions
    FOR EACH ROW EXECUTE FUNCTION goal_contributions_conta_tg();

-- ----------------------------------------------------------------- contas
--
-- Cofrinho em uso não deixa de ser cofrinho: a FK não olha o tipo da conta.

CREATE FUNCTION accounts_cofrinho_em_uso_tg() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
BEGIN
    IF OLD.kind = 'goal' AND NEW.kind <> 'goal' AND (
           EXISTS (SELECT 1 FROM public.categories WHERE goal_account_id = OLD.id)
        OR EXISTS (SELECT 1 FROM public.goal_contributions WHERE account_id = OLD.id)
        OR EXISTS (SELECT 1 FROM public.transactions
                    WHERE account_id = OLD.id AND funds_expense_id IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'a conta % é cofrinho em uso e não pode mudar de tipo', OLD.id
            USING ERRCODE = '23F20';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER accounts_cofrinho_em_uso
    BEFORE UPDATE OF kind ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_cofrinho_em_uso_tg();

-- ------------------------------------------------------------ lançamentos
--
-- Diferido: a despesa e as duas pernas do resgate entram em comandos
-- separados, como as pernas da transferência na migration 002.

CREATE FUNCTION verifica_custeio(p_despesa uuid) RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
DECLARE
    v_kind     transaction_kind;
    v_amount   numeric(14, 2);
    v_nature   category_nature;
    v_cofrinho uuid;
    v_pago     numeric(14, 2);
BEGIN
    SELECT t.kind, t.amount, c.nature, c.goal_account_id
      INTO v_kind, v_amount, v_nature, v_cofrinho
      FROM public.transactions t
      LEFT JOIN public.categories c ON c.id = t.category_id
     WHERE t.id = p_despesa;

    IF v_kind IS DISTINCT FROM 'expense'
       OR v_nature IS DISTINCT FROM 'goal_backed'
       OR EXISTS (
           SELECT 1 FROM public.transactions
            WHERE funds_expense_id = p_despesa
              AND account_id <> v_cofrinho
       ) THEN
        RAISE EXCEPTION
            'o lançamento % não é despesa de categoria com este cofrinho', p_despesa
            USING ERRCODE = '23F22';
    END IF;

    SELECT COALESCE(sum(-amount), 0) INTO v_pago
      FROM public.transactions
     WHERE funds_expense_id = p_despesa;

    IF v_pago > -v_amount THEN
        RAISE EXCEPTION
            'resgates pagam % da despesa %, que vale %', v_pago, p_despesa, -v_amount
            USING ERRCODE = '23F23';
    END IF;
END
$$;

CREATE FUNCTION transactions_custeio_tg() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
DECLARE
    v_tx    public.transactions%ROWTYPE;
    v_conta account_kind;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN NULL;
    END IF;

    -- Diferido: a linha pode ter mudado entre o comando e o fim da transação.
    -- Lê o estado atual, não o NEW do evento.
    SELECT * INTO v_tx FROM public.transactions WHERE id = NEW.id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_tx.funds_expense_id IS NOT NULL THEN
        SELECT kind INTO v_conta FROM public.accounts WHERE id = v_tx.account_id;
        IF v_tx.kind <> 'transfer' OR v_tx.amount >= 0 OR v_conta <> 'goal' THEN
            RAISE EXCEPTION
                'só a perna de saída de um cofrinho aponta despesa (lançamento %)', v_tx.id
                USING ERRCODE = '23F21';
        END IF;
        PERFORM public.verifica_custeio(v_tx.funds_expense_id);
    END IF;

    -- A própria despesa mudou (valor, categoria, tipo): confere de novo.
    IF EXISTS (SELECT 1 FROM public.transactions WHERE funds_expense_id = v_tx.id) THEN
        PERFORM public.verifica_custeio(v_tx.id);
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER transactions_custeio
    AFTER INSERT OR UPDATE ON transactions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION transactions_custeio_tg();

-- ============================================================================
-- RLS e permissões — o padrão da 001
-- ============================================================================

ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_contributions_isolamento ON goal_contributions
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON goal_contributions TO app;
