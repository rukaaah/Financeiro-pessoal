-- Migration 002 — o núcleo do modelo: contas, categorias e lançamentos.
--
-- Aplica em cada tabela o padrão de RLS fixado na 001 e coloca no banco os dois
-- invariantes que o ADR-001 manda viver aqui, e não no Python: a transferência
-- que soma zero e o mês de fatura do ADR-005.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Os SQLSTATE próprios desta migration ficam na classe 23 (violação de
-- restrição de integridade), que é o que de fato são. A classe importa: o
-- psycopg mapeia 23xxx para IntegrityError, enquanto uma classe inventada cai
-- em OperationalError — que sugere falha de conexão e confundiria o tratamento
-- de erro da aplicação. O código completo continua disponível em `.sqlstate`.
--
--   23F01  compra em cartão sem account_terms vigente na data
--   23F02  invoice_month informado diverge do calculado
--   23F03  invoice_month em conta que não é cartão
--   23F10  transferência sem exatamente duas pernas
--   23F11  transferência que não soma zero
--   23F12  transferência com a mesma conta nas duas pernas
--   23F13  transferência atravessando usuários

-- ------------------------------------------------------------------ tipos

CREATE TYPE account_kind AS ENUM (
    'checking',     -- conta corrente, o dia a dia
    'credit_card',  -- cartão: a única que tem fatura e invoice_month
    'goal',         -- cofrinho (RF18)
    'receivable',   -- valores a receber de uma pessoa (RF17)
    'investment',
    'cash'
);

CREATE TYPE transaction_kind AS ENUM ('income', 'expense', 'transfer');

CREATE TYPE category_kind AS ENUM ('income', 'expense');

-- --------------------------------------------------------- counterparties
--
-- As pessoas por quem se paga e de quem se recebe (RF17).

CREATE TABLE counterparties (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    name       text        NOT NULL,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT counterparties_nome_nao_vazio CHECK (length(btrim(name)) > 0),
    CONSTRAINT counterparties_nome_unico     UNIQUE (user_id, name),
    -- Alvo das FKs compostas: ver o comentário em `accounts`.
    CONSTRAINT counterparties_user_id_id     UNIQUE (user_id, id)
);

-- ------------------------------------------------------------------ accounts

CREATE TABLE accounts (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid         NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    name            text         NOT NULL,
    kind            account_kind NOT NULL,
    counterparty_id uuid,
    active          boolean      NOT NULL DEFAULT true,
    created_at      timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT accounts_nome_nao_vazio CHECK (length(btrim(name)) > 0),
    CONSTRAINT accounts_nome_unico     UNIQUE (user_id, name),
    CONSTRAINT accounts_user_id_id     UNIQUE (user_id, id),

    -- FK **composta**, incluindo user_id de propósito. Uma FK simples para
    -- counterparties(id) deixaria alguém apontar para a contraparte de outra
    -- pessoa: a RLS esconde a linha na leitura, mas a FK confirmaria que aquele
    -- id existe. Carregar o user_id na FK fecha esse canal.
    CONSTRAINT accounts_counterparty_fk
        FOREIGN KEY (user_id, counterparty_id)
        REFERENCES counterparties (user_id, id) ON DELETE RESTRICT,

    -- Conta de valores a receber é sempre de alguém; as outras, de ninguém.
    CONSTRAINT accounts_contraparte_so_em_receivable
        CHECK ((kind = 'receivable') = (counterparty_id IS NOT NULL))
);

-- -------------------------------------------------------------- account_terms
--
-- Fechamento e vencimento do cartão, com vigência (ADR-005). O banco muda essas
-- datas, e o histórico precisa continuar sendo calculado com a regra da época.

CREATE TABLE account_terms (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    account_id  uuid        NOT NULL,
    vigencia    daterange   NOT NULL,
    closing_day smallint    NOT NULL,
    due_day     smallint    NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT account_terms_account_fk
        FOREIGN KEY (user_id, account_id)
        REFERENCES accounts (user_id, id) ON DELETE CASCADE,

    -- 1..31: o Unicred vence dia 30, então 28 não serve de teto. Meses curtos
    -- são resolvidos na hora de materializar a data de vencimento, não aqui —
    -- o invoice_month depende só do mês.
    CONSTRAINT account_terms_closing_day_valido CHECK (closing_day BETWEEN 1 AND 31),
    CONSTRAINT account_terms_due_day_valido     CHECK (due_day     BETWEEN 1 AND 31),
    CONSTRAINT account_terms_vigencia_nao_vazia CHECK (NOT isempty(vigencia)),

    -- Duas vigências da mesma conta nunca se sobrepõem: sem isso o cálculo do
    -- invoice_month seria ambíguo.
    CONSTRAINT account_terms_sem_sobreposicao
        EXCLUDE USING gist (account_id WITH =, vigencia WITH &&)
);

-- ------------------------------------------------------------ categorias

CREATE TABLE category_groups (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    name       text        NOT NULL,
    sort_order smallint    NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT category_groups_nome_nao_vazio CHECK (length(btrim(name)) > 0),
    CONSTRAINT category_groups_nome_unico     UNIQUE (user_id, name),
    CONSTRAINT category_groups_user_id_id     UNIQUE (user_id, id)
);

CREATE TABLE categories (
    id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid          NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    group_id   uuid          NOT NULL,
    name       text          NOT NULL,
    kind       category_kind NOT NULL,
    active     boolean       NOT NULL DEFAULT true,
    created_at timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT categories_group_fk
        FOREIGN KEY (user_id, group_id)
        REFERENCES category_groups (user_id, id) ON DELETE RESTRICT,

    CONSTRAINT categories_nome_nao_vazio CHECK (length(btrim(name)) > 0),
    CONSTRAINT categories_nome_unico     UNIQUE (user_id, name),
    CONSTRAINT categories_user_id_id     UNIQUE (user_id, id)
);

-- --------------------------------------------------------------- transactions
--
-- Valores são **assinados**: receita positiva, despesa negativa, e as duas
-- pernas da transferência com sinais opostos. Assim o saldo de uma conta é
-- `sum(amount)`, sem caso especial, e "soma zero" é literalmente soma zero.

CREATE TABLE transactions (
    id         uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid             NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    kind       transaction_kind NOT NULL,
    account_id uuid             NOT NULL,

    category_id     uuid,
    counterparty_id uuid,

    -- Agrupa as duas pernas de uma transferência.
    transfer_id uuid,

    amount      numeric(14, 2) NOT NULL,
    occurred_on date           NOT NULL,
    description text           NOT NULL DEFAULT '',

    -- Só para conta de cartão. Calculado e verificado por trigger (ADR-005).
    invoice_month date,

    -- Parcelamento: cada parcela é uma linha, e cai na fatura em que vence.
    installment_no       smallint,
    installment_total    smallint,
    installment_group_id uuid,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT transactions_account_fk
        FOREIGN KEY (user_id, account_id)
        REFERENCES accounts (user_id, id) ON DELETE RESTRICT,
    CONSTRAINT transactions_category_fk
        FOREIGN KEY (user_id, category_id)
        REFERENCES categories (user_id, id) ON DELETE RESTRICT,
    CONSTRAINT transactions_counterparty_fk
        FOREIGN KEY (user_id, counterparty_id)
        REFERENCES counterparties (user_id, id) ON DELETE RESTRICT,

    CONSTRAINT transactions_valor_nao_zero CHECK (amount <> 0),

    -- O sinal tem que concordar com o tipo. A transferência fica de fora porque
    -- tem uma perna de cada sinal.
    CONSTRAINT transactions_sinal_casa_com_tipo CHECK (
        (kind = 'income'  AND amount > 0) OR
        (kind = 'expense' AND amount < 0) OR
        (kind = 'transfer')
    ),

    -- transfer_id existe se, e só se, o lançamento for transferência.
    CONSTRAINT transactions_transfer_id_so_em_transferencia
        CHECK ((kind = 'transfer') = (transfer_id IS NOT NULL)),

    -- Receita e despesa são categorizadas; transferência não é gasto nem
    -- receita, então não entra em categoria nenhuma (RF17).
    CONSTRAINT transactions_categoria_exceto_transferencia
        CHECK ((kind = 'transfer') = (category_id IS NULL)),

    -- Os três campos de parcela andam juntos, e a parcela cabe no total.
    CONSTRAINT transactions_parcelamento_coerente CHECK (
        (installment_no IS NULL) = (installment_total IS NULL)
        AND (installment_no IS NULL) = (installment_group_id IS NULL)
        AND (
            installment_no IS NULL
            OR (installment_no >= 1 AND installment_total >= 2
                AND installment_no <= installment_total)
        )
    ),

    CONSTRAINT transactions_invoice_month_e_primeiro_dia
        CHECK (invoice_month IS NULL OR EXTRACT(DAY FROM invoice_month) = 1)
);

CREATE INDEX transactions_user_data        ON transactions (user_id, occurred_on DESC);
CREATE INDEX transactions_user_conta_data  ON transactions (user_id, account_id, occurred_on DESC);
CREATE INDEX transactions_user_categoria   ON transactions (user_id, category_id)
    WHERE category_id IS NOT NULL;
CREATE INDEX transactions_user_fatura      ON transactions (user_id, invoice_month)
    WHERE invoice_month IS NOT NULL;
CREATE INDEX transactions_transfer         ON transactions (transfer_id)
    WHERE transfer_id IS NOT NULL;
CREATE INDEX transactions_parcelamento     ON transactions (installment_group_id)
    WHERE installment_group_id IS NOT NULL;

-- ============================================================================
-- Invariante 1 — mês da fatura (ADR-005)
-- ============================================================================

CREATE FUNCTION invoice_month_for(
    p_account_id     uuid,
    p_occurred_on    date,
    p_installment_no smallint
) RETURNS date
    LANGUAGE plpgsql
    STABLE
    AS $$
DECLARE
    v_closing      smallint;
    v_due          smallint;
    v_mes_fecha    date;
    v_mes_vence    date;
BEGIN
    SELECT closing_day, due_day
      INTO v_closing, v_due
      FROM account_terms
     WHERE account_id = p_account_id
       AND vigencia @> p_occurred_on;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'sem account_terms vigente para a conta % na data %',
            p_account_id, p_occurred_on
            USING ERRCODE = '23F01';
    END IF;

    -- Em que mês esta compra entra na fatura que fecha?
    -- Antes do dia de fechamento, na que fecha neste mês; a partir dele
    -- (inclusive), na do mês seguinte.
    v_mes_fecha := date_trunc('month', p_occurred_on)::date;
    IF EXTRACT(DAY FROM p_occurred_on) >= v_closing THEN
        v_mes_fecha := (v_mes_fecha + INTERVAL '1 month')::date;
    END IF;

    -- E quando essa fatura vence? No mesmo mês, se o dia de vencimento vem
    -- depois do de fechamento (Unicred: fecha 23, vence 30). No mês seguinte,
    -- se vier antes ou no mesmo dia.
    v_mes_vence := v_mes_fecha;
    IF v_due <= v_closing THEN
        v_mes_vence := (v_mes_vence + INTERVAL '1 month')::date;
    END IF;

    -- Cada parcela cai numa fatura adiante da anterior.
    RETURN (v_mes_vence
            + make_interval(months => COALESCE(p_installment_no, 1) - 1))::date;
END
$$;

COMMENT ON FUNCTION invoice_month_for(uuid, date, smallint) IS
    'Mês de vencimento da fatura em que a compra cai, conforme o ADR-005. '
    'Levanta 23F01 se não houver account_terms vigente na data.';

CREATE FUNCTION transactions_invoice_month_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind     account_kind;
    v_esperado date;
BEGIN
    SELECT kind INTO v_kind FROM accounts WHERE id = NEW.account_id;

    IF v_kind = 'credit_card' THEN
        v_esperado := invoice_month_for(
            NEW.account_id, NEW.occurred_on, NEW.installment_no
        );

        IF NEW.invoice_month IS NULL THEN
            NEW.invoice_month := v_esperado;
        ELSIF NEW.invoice_month <> v_esperado THEN
            -- Recusa em vez de aceitar o que veio: o ADR-005 trata o mês da
            -- fatura como invariante, não como campo editável. Permitir
            -- exceção (fatura remanejada pelo banco) exige um ADR novo.
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

CREATE TRIGGER transactions_invoice_month
    BEFORE INSERT OR UPDATE OF account_id, occurred_on, installment_no, invoice_month
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_invoice_month_tg();

-- ============================================================================
-- Invariante 2 — transferência soma zero
-- ============================================================================
--
-- CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED: as duas pernas entram em
-- comandos separados, então a checagem só pode acontecer no fim da transação.
-- Um trigger comum reprovaria a primeira perna sempre.
--
-- SECURITY DEFINER para que a contagem enxergue as duas pernas mesmo que a RLS
-- esconderia alguma: o invariante não pode depender de quem está perguntando.

CREATE FUNCTION transactions_transfer_soma_zero_tg() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
DECLARE
    v_transfer uuid;
    v_pernas   integer;
    v_soma     numeric(14, 2);
    v_contas   integer;
    v_usuarios integer;
BEGIN
    v_transfer := COALESCE(NEW.transfer_id, OLD.transfer_id);
    IF v_transfer IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT count(*), COALESCE(sum(amount), 0),
           count(DISTINCT account_id), count(DISTINCT user_id)
      INTO v_pernas, v_soma, v_contas, v_usuarios
      FROM public.transactions
     WHERE transfer_id = v_transfer;

    -- Grupo inteiro apagado: nada a verificar.
    IF v_pernas = 0 THEN
        RETURN NULL;
    END IF;

    IF v_pernas <> 2 THEN
        RAISE EXCEPTION
            'transferência % tem % perna(s); precisa ter exatamente 2',
            v_transfer, v_pernas
            USING ERRCODE = '23F10';
    END IF;

    IF v_soma <> 0 THEN
        RAISE EXCEPTION
            'transferência % soma %; precisa somar zero', v_transfer, v_soma
            USING ERRCODE = '23F11';
    END IF;

    IF v_contas <> 2 THEN
        RAISE EXCEPTION
            'transferência % usa a mesma conta nas duas pernas', v_transfer
            USING ERRCODE = '23F12';
    END IF;

    IF v_usuarios <> 1 THEN
        RAISE EXCEPTION
            'transferência % atravessa usuários', v_transfer
            USING ERRCODE = '23F13';
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER transactions_transfer_soma_zero
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION transactions_transfer_soma_zero_tg();

-- ============================================================================
-- RLS — o mesmo padrão da 001 em cada tabela
-- ============================================================================

ALTER TABLE counterparties  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_terms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;

CREATE POLICY counterparties_isolamento ON counterparties
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY accounts_isolamento ON accounts
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY account_terms_isolamento ON account_terms
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY category_groups_isolamento ON category_groups
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY categories_isolamento ON categories
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

CREATE POLICY transactions_isolamento ON transactions
    FOR ALL TO app
    USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON
    counterparties, accounts, account_terms, category_groups, categories, transactions
    TO app;
