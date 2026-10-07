-- Gerado por scripts/dump_schema.sh. Não edite à mão.
-- Reflete as migrations aplicadas no Postgres local.

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: account_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_kind AS ENUM (
    'checking',
    'credit_card',
    'goal',
    'receivable',
    'investment',
    'cash'
);


--
-- Name: category_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.category_kind AS ENUM (
    'income',
    'expense'
);


--
-- Name: transaction_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_kind AS ENUM (
    'income',
    'expense',
    'transfer'
);


--
-- Name: current_app_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: FUNCTION current_app_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_app_user() IS 'Usuário da transação corrente, vindo de SET LOCAL app.user_id. NULL quando não definido, para que as policies de RLS não retornem nada (ADR-004).';


--
-- Name: demo_app_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_app_user() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT id FROM public.app_users WHERE is_demo AND active
$$;


--
-- Name: FUNCTION demo_app_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.demo_app_user() IS 'Id do usuário demo ativo, destino de quem não está na allowlist (ADR-003).';


--
-- Name: invoice_month_for(uuid, date, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint) RETURNS date
    LANGUAGE plpgsql STABLE
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


--
-- Name: FUNCTION invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint) IS 'Mês de vencimento da fatura em que a compra cai (ADR-005, refinado pelo ADR-007). Levanta 23F01 se não houver account_terms vigente na data.';


--
-- Name: resolve_app_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_app_user(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    SELECT id FROM public.app_users WHERE email = lower(p_email) AND active
$$;


--
-- Name: FUNCTION resolve_app_user(p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.resolve_app_user(p_email text) IS 'E-mail verificado -> id do usuário ativo, ou NULL se não está na allowlist. SECURITY DEFINER porque roda antes de app.user_id existir.';


--
-- Name: transactions_invoice_month_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transactions_invoice_month_tg() RETURNS trigger
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


--
-- Name: transactions_transfer_soma_zero_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transactions_transfer_soma_zero_tg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    vigencia daterange NOT NULL,
    cycle_start_day smallint NOT NULL,
    due_day smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_terms_cycle_start_day_valido CHECK (((cycle_start_day >= 1) AND (cycle_start_day <= 31))),
    CONSTRAINT account_terms_due_day_valido CHECK (((due_day >= 1) AND (due_day <= 31))),
    CONSTRAINT account_terms_vigencia_nao_vazia CHECK ((NOT isempty(vigencia)))
);


--
-- Name: COLUMN account_terms.cycle_start_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_terms.cycle_start_day IS 'Dia em que uma fatura nova começa a acumular. NÃO é o número que o banco imprime como "fechamento": no Unicred (ciclo 04→03) cadastra-se 4, e no Nubank (ciclo 28→27, anunciado como "fecha 27") cadastra-se 28. Ver ADR-007.';


--
-- Name: COLUMN account_terms.due_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_terms.due_day IS 'Dia do vencimento. Se for menor que cycle_start_day, a fatura vence no mês seguinte ao do fim do ciclo (caso Nubank: fecha 27/10, vence 05/11).';


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    kind public.account_kind NOT NULL,
    counterparty_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_contraparte_so_em_receivable CHECK (((kind = 'receivable'::public.account_kind) = (counterparty_id IS NOT NULL))),
    CONSTRAINT accounts_nome_nao_vazio CHECK ((length(btrim(name)) > 0))
);


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    is_demo boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_users_display_name_nao_vazio CHECK ((length(btrim(display_name)) > 0)),
    CONSTRAINT app_users_email_formato CHECK ((email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)),
    CONSTRAINT app_users_email_minusculo CHECK ((email = lower(email)))
);


--
-- Name: TABLE app_users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_users IS 'Allowlist de acesso (ADR-003). E-mail ausente aqui cai no modo demo.';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    kind public.category_kind NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT categories_nome_nao_vazio CHECK ((length(btrim(name)) > 0))
);


--
-- Name: category_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_groups_nome_nao_vazio CHECK ((length(btrim(name)) > 0))
);


--
-- Name: counterparties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT counterparties_nome_nao_vazio CHECK ((length(btrim(name)) > 0))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind public.transaction_kind NOT NULL,
    account_id uuid NOT NULL,
    category_id uuid,
    counterparty_id uuid,
    transfer_id uuid,
    amount numeric(14,2) NOT NULL,
    occurred_on date NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    invoice_month date,
    installment_no smallint,
    installment_total smallint,
    installment_group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transactions_categoria_exceto_transferencia CHECK (((kind = 'transfer'::public.transaction_kind) = (category_id IS NULL))),
    CONSTRAINT transactions_invoice_month_e_primeiro_dia CHECK (((invoice_month IS NULL) OR (EXTRACT(day FROM invoice_month) = (1)::numeric))),
    CONSTRAINT transactions_parcelamento_coerente CHECK ((((installment_no IS NULL) = (installment_total IS NULL)) AND ((installment_no IS NULL) = (installment_group_id IS NULL)) AND ((installment_no IS NULL) OR ((installment_no >= 1) AND (installment_total >= 2) AND (installment_no <= installment_total))))),
    CONSTRAINT transactions_sinal_casa_com_tipo CHECK ((((kind = 'income'::public.transaction_kind) AND (amount > (0)::numeric)) OR ((kind = 'expense'::public.transaction_kind) AND (amount < (0)::numeric)) OR (kind = 'transfer'::public.transaction_kind))),
    CONSTRAINT transactions_transfer_id_so_em_transferencia CHECK (((kind = 'transfer'::public.transaction_kind) = (transfer_id IS NOT NULL))),
    CONSTRAINT transactions_valor_nao_zero CHECK ((amount <> (0)::numeric))
);


--
-- Name: account_terms account_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_terms
    ADD CONSTRAINT account_terms_pkey PRIMARY KEY (id);


--
-- Name: account_terms account_terms_sem_sobreposicao; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_terms
    ADD CONSTRAINT account_terms_sem_sobreposicao EXCLUDE USING gist (account_id WITH =, vigencia WITH &&);


--
-- Name: accounts accounts_nome_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_nome_unico UNIQUE (user_id, name);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_id UNIQUE (user_id, id);


--
-- Name: app_users app_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: categories categories_nome_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_nome_unico UNIQUE (user_id, name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_user_id_id UNIQUE (user_id, id);


--
-- Name: category_groups category_groups_nome_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_groups
    ADD CONSTRAINT category_groups_nome_unico UNIQUE (user_id, name);


--
-- Name: category_groups category_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_groups
    ADD CONSTRAINT category_groups_pkey PRIMARY KEY (id);


--
-- Name: category_groups category_groups_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_groups
    ADD CONSTRAINT category_groups_user_id_id UNIQUE (user_id, id);


--
-- Name: counterparties counterparties_nome_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_nome_unico UNIQUE (user_id, name);


--
-- Name: counterparties counterparties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_pkey PRIMARY KEY (id);


--
-- Name: counterparties counterparties_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_user_id_id UNIQUE (user_id, id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: app_users_um_demo_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_um_demo_ativo ON public.app_users USING btree (is_demo) WHERE (is_demo AND active);


--
-- Name: transactions_parcelamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_parcelamento ON public.transactions USING btree (installment_group_id) WHERE (installment_group_id IS NOT NULL);


--
-- Name: transactions_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_transfer ON public.transactions USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);


--
-- Name: transactions_user_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_categoria ON public.transactions USING btree (user_id, category_id) WHERE (category_id IS NOT NULL);


--
-- Name: transactions_user_conta_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_conta_data ON public.transactions USING btree (user_id, account_id, occurred_on DESC);


--
-- Name: transactions_user_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_data ON public.transactions USING btree (user_id, occurred_on DESC);


--
-- Name: transactions_user_fatura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_fatura ON public.transactions USING btree (user_id, invoice_month) WHERE (invoice_month IS NOT NULL);


--
-- Name: transactions transactions_invoice_month; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_invoice_month BEFORE INSERT OR UPDATE OF kind, account_id, occurred_on, installment_no, invoice_month ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.transactions_invoice_month_tg();


--
-- Name: transactions transactions_transfer_soma_zero; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER transactions_transfer_soma_zero AFTER INSERT OR DELETE OR UPDATE ON public.transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.transactions_transfer_soma_zero_tg();


--
-- Name: account_terms account_terms_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_terms
    ADD CONSTRAINT account_terms_account_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE CASCADE;


--
-- Name: account_terms account_terms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_terms
    ADD CONSTRAINT account_terms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_counterparty_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_counterparty_fk FOREIGN KEY (user_id, counterparty_id) REFERENCES public.counterparties(user_id, id) ON DELETE RESTRICT;


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: categories categories_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_group_fk FOREIGN KEY (user_id, group_id) REFERENCES public.category_groups(user_id, id) ON DELETE RESTRICT;


--
-- Name: categories categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: category_groups category_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_groups
    ADD CONSTRAINT category_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: counterparties counterparties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_fk FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_counterparty_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_counterparty_fk FOREIGN KEY (user_id, counterparty_id) REFERENCES public.counterparties(user_id, id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: account_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: account_terms account_terms_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_terms_isolamento ON public.account_terms TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts accounts_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY accounts_isolamento ON public.accounts TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_isolamento ON public.app_users TO app USING ((id = public.current_app_user())) WITH CHECK ((id = public.current_app_user()));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_isolamento ON public.categories TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: category_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: category_groups category_groups_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY category_groups_isolamento ON public.category_groups TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: counterparties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;

--
-- Name: counterparties counterparties_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparties_isolamento ON public.counterparties TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_isolamento ON public.transactions TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO app;
GRANT USAGE ON SCHEMA public TO jobs;


--
-- Name: FUNCTION demo_app_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.demo_app_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.demo_app_user() TO app;


--
-- Name: FUNCTION resolve_app_user(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_app_user(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_app_user(p_email text) TO app;


--
-- Name: TABLE account_terms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_terms TO app;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts TO app;


--
-- Name: TABLE app_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_users TO app;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categories TO app;


--
-- Name: TABLE category_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.category_groups TO app;


--
-- Name: TABLE counterparties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.counterparties TO app;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactions TO app;


--
-- PostgreSQL database dump complete
--
