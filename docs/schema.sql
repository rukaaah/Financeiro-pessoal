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
-- Name: asset_class; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_class AS ENUM (
    'paper',
    'brick',
    'logistics',
    'infra',
    'treasury',
    'other'
);


--
-- Name: bill_urgency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bill_urgency AS ENUM (
    'essential',
    'important',
    'deferrable'
);


--
-- Name: category_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.category_kind AS ENUM (
    'income',
    'expense'
);


--
-- Name: category_nature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.category_nature AS ENUM (
    'variable',
    'fixed',
    'goal_backed'
);


--
-- Name: goal_movement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goal_movement AS ENUM (
    'use',
    'loan',
    'withdrawal',
    'repayment'
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
-- Name: accounts_cofrinho_em_uso_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accounts_cofrinho_em_uso_tg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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


--
-- Name: admin_list_app_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_app_users() RETURNS TABLE(id uuid, email text, display_name text, is_demo boolean, is_admin boolean, active boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
    -- `current_app_user()` lê app.user_id, que a unit of work define por
    -- transação (ADR-004). Sem isso, não há quem perguntar.
    IF NOT EXISTS (
        SELECT 1 FROM public.app_users u
         WHERE u.id = current_app_user() AND u.is_admin AND u.active
    ) THEN
        RAISE EXCEPTION 'esta operação é só para quem administra o app (RF19)'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT u.id, u.email, u.display_name, u.is_demo, u.is_admin,
               u.active, u.created_at
          FROM public.app_users u
         ORDER BY u.is_demo, u.email;
END
$$;


--
-- Name: FUNCTION admin_list_app_users(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_list_app_users() IS 'Lista a allowlist inteira para quem administra (RF19). SECURITY DEFINER porque a policy de app_users deixa ver só a própria linha; a permissão é checada por dentro da função, não pela tela.';


--
-- Name: categories_cofrinho_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.categories_cofrinho_tg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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
-- Name: exige_cofrinho(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exige_cofrinho(p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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


--
-- Name: goal_contributions_conta_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_contributions_conta_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM exige_cofrinho(NEW.account_id);
    RETURN NEW;
END
$$;


--
-- Name: invoice_month_for(uuid, date, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint) RETURNS date
    LANGUAGE plpgsql STABLE
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


--
-- Name: FUNCTION invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.invoice_month_for(p_account_id uuid, p_occurred_on date, p_installment_no smallint) IS 'Mês de vencimento da fatura em que a compra cai (ADR-005, com o fechamento inclusivo do ADR-008). Levanta 23F01 sem account_terms vigente.';


--
-- Name: mes_do_orcamento(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mes_do_orcamento(p_occurred_on date, p_invoice_month date) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$ SELECT coalesce(p_invoice_month, date_trunc('month', p_occurred_on)::date) $$;


--
-- Name: previsto_do_mes(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.previsto_do_mes(p_mes date) RETURNS TABLE(category_id uuid, previsto numeric, ajustado boolean)
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
-- Name: tickers_em_carteira(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tickers_em_carteira() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT DISTINCT ticker FROM assets WHERE class <> 'treasury' ORDER BY 1 $$;


--
-- Name: transactions_custeio_tg(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transactions_custeio_tg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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

    -- Quem quita uma fatura é, necessariamente, uma perna de transferência de
    -- entrada numa conta de cartão. Qualquer outra combinação é erro de quem
    -- escreveu, e falhar alto aqui é melhor que um total de fatura errado numa
    -- tela.
    IF NEW.settles_invoice_month IS NOT NULL THEN
        IF NEW.kind <> 'transfer' THEN
            RAISE EXCEPTION
                'só transferência quita fatura; este lançamento é % (ADR-010)',
                NEW.kind
                USING ERRCODE = '23F05';
        END IF;

        IF v_kind IS DISTINCT FROM 'credit_card' THEN
            RAISE EXCEPTION
                'só conta de cartão tem fatura a quitar; esta é % (ADR-010)',
                v_kind
                USING ERRCODE = '23F06';
        END IF;

        -- Na conta do cartão a compra é negativa e o pagamento é positivo: é o
        -- lado que reduz a dívida. A perna que sai da conta corrente não quita
        -- nada, ela só paga.
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION
                'a perna que quita a fatura é a de entrada no cartão, e esta é de % (ADR-010)',
                NEW.amount
                USING ERRCODE = '23F07';
        END IF;
    END IF;

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
-- Name: FUNCTION transactions_invoice_month_tg(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.transactions_invoice_month_tg() IS 'Calcula e verifica invoice_month (ADR-005/008) e verifica o contexto de settles_invoice_month (ADR-010).';


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


--
-- Name: verifica_custeio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verifica_custeio(p_despesa uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
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
    closing_day smallint NOT NULL,
    due_day smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_terms_closing_day_valido CHECK (((closing_day >= 1) AND (closing_day <= 31))),
    CONSTRAINT account_terms_due_day_valido CHECK (((due_day >= 1) AND (due_day <= 31))),
    CONSTRAINT account_terms_vigencia_nao_vazia CHECK ((NOT isempty(vigencia)))
);


--
-- Name: COLUMN account_terms.closing_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_terms.closing_day IS 'Dia do fechamento, exatamente como o app do banco informa. É inclusivo: a compra feita neste dia ainda entra na fatura que fecha hoje. Unicred 4, Nubank 27. Ver ADR-008.';


--
-- Name: COLUMN account_terms.due_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_terms.due_day IS 'Dia do vencimento, como o app do banco informa. Costuma ser de 7 a 10 dias após o fechamento; quando é menor que closing_day, a fatura vence no mês seguinte ao do fechamento (Nubank: fecha 27/09, vence 05/10).';


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
-- Name: allocation_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocation_targets (
    user_id uuid NOT NULL,
    class public.asset_class NOT NULL,
    percent numeric(5,2) NOT NULL,
    CONSTRAINT allocation_targets_percentual CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric)))
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
    is_admin boolean DEFAULT false NOT NULL,
    CONSTRAINT app_users_demo_nao_administra CHECK ((NOT (is_demo AND is_admin))),
    CONSTRAINT app_users_display_name_nao_vazio CHECK ((length(btrim(display_name)) > 0)),
    CONSTRAINT app_users_email_formato CHECK ((email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)),
    CONSTRAINT app_users_email_minusculo CHECK ((email = lower(email)))
);


--
-- Name: TABLE app_users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_users IS 'Allowlist de acesso (ADR-003). E-mail ausente aqui cai no modo demo.';


--
-- Name: COLUMN app_users.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_users.is_admin IS 'Pode liberar e desativar acesso de outras pessoas (RF19). A regra vale no banco, por função SECURITY DEFINER: esconder a tela não protege nada.';


--
-- Name: asset_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_quotes (
    ticker text NOT NULL,
    quoted_on date NOT NULL,
    price numeric(14,6) NOT NULL,
    pvp numeric(8,4),
    dy_12m numeric(8,4),
    liquidity numeric(18,2),
    source text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    traded_on date NOT NULL,
    quantity numeric(18,6) NOT NULL,
    unit_price numeric(14,6) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_trades_preco_positivo CHECK ((unit_price > (0)::numeric)),
    CONSTRAINT asset_trades_quantidade_nao_zero CHECK ((quantity <> (0)::numeric))
);


--
-- Name: COLUMN asset_trades.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asset_trades.quantity IS 'Positiva na compra, negativa na venda.';


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ticker text NOT NULL,
    name text NOT NULL,
    class public.asset_class NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assets_ticker_formato CHECK ((ticker ~ '^[A-Z0-9 ]{3,30}$'::text))
);


--
-- Name: attention_snoozes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attention_snoozes (
    user_id uuid NOT NULL,
    item_key text NOT NULL,
    until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN attention_snoozes.until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.attention_snoozes.until IS 'Escondido até esta data; NULL é resolvido de vez.';


--
-- Name: budget_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    month date NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT budget_adjustments_primeiro_dia CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT budget_adjustments_valor_positivo CHECK ((amount >= (0)::numeric))
);


--
-- Name: TABLE budget_adjustments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.budget_adjustments IS 'Exceção do previsto num mês específico; ausente, vale o padrão (ADR-019).';


--
-- Name: budget_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    valid_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT budget_templates_primeiro_dia CHECK ((EXTRACT(day FROM valid_from) = (1)::numeric)),
    CONSTRAINT budget_templates_valor_positivo CHECK ((amount >= (0)::numeric))
);


--
-- Name: TABLE budget_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.budget_templates IS 'Previsto padrão de uma categoria, valendo a partir de valid_from até o próximo (ADR-019).';


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
    nature public.category_nature DEFAULT 'variable'::public.category_nature NOT NULL,
    goal_account_id uuid,
    CONSTRAINT categories_cofrinho_so_em_goal_backed CHECK (((nature = 'goal_backed'::public.category_nature) = (goal_account_id IS NOT NULL))),
    CONSTRAINT categories_natureza_so_em_despesa CHECK (((kind = 'expense'::public.category_kind) OR (nature = 'variable'::public.category_nature))),
    CONSTRAINT categories_nome_nao_vazio CHECK ((length(btrim(name)) > 0))
);


--
-- Name: COLUMN categories.nature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.nature IS 'Natureza da categoria (ADR-014). Decide se ela aparece em "Onde ainda cabe" e como o Resumo a lê. Só despesa foge de variable.';


--
-- Name: COLUMN categories.goal_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.goal_account_id IS 'Cofrinho que paga os gastos desta categoria. Existe se, e só se, nature = goal_backed (ADR-014).';


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
-- Name: expected_incomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expected_incomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description text NOT NULL,
    currency text DEFAULT 'BRL'::text NOT NULL,
    amount numeric(14,2) NOT NULL,
    expected_on date NOT NULL,
    account_id uuid NOT NULL,
    category_id uuid NOT NULL,
    transaction_id uuid,
    received_brl numeric(14,2),
    reference_rate numeric(12,5),
    fee_brl numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expected_incomes_moeda CHECK ((currency = ANY (ARRAY['BRL'::text, 'USD'::text]))),
    CONSTRAINT expected_incomes_recebido_completo CHECK (((transaction_id IS NULL) = (received_brl IS NULL))),
    CONSTRAINT expected_incomes_valor_positivo CHECK ((amount > (0)::numeric))
);


--
-- Name: COLUMN expected_incomes.fee_brl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expected_incomes.fee_brl IS 'Quanto o intermediário (PayPal) ficou: amount × reference_rate (PTAX de venda do dia) − received_brl.';


--
-- Name: goal_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    vigencia daterange NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_contributions_valor_positivo CHECK ((amount > (0)::numeric)),
    CONSTRAINT goal_contributions_vigencia_nao_vazia CHECK ((NOT isempty(vigencia)))
);


--
-- Name: TABLE goal_contributions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.goal_contributions IS 'Quanto do salário vai para o cofrinho por mês, com vigência (ADR-014).';


--
-- Name: goal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_settings (
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    target numeric(14,2),
    target_date date,
    started_on date DEFAULT CURRENT_DATE NOT NULL,
    cdi_percent numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_settings_cdi CHECK (((cdi_percent IS NULL) OR ((cdi_percent >= (0)::numeric) AND (cdi_percent <= (300)::numeric)))),
    CONSTRAINT goal_settings_datas CHECK (((target_date IS NULL) OR (target_date > started_on))),
    CONSTRAINT goal_settings_meta_positiva CHECK (((target IS NULL) OR (target > (0)::numeric)))
);


--
-- Name: investment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investment_rules (
    user_id uuid NOT NULL,
    max_pvp numeric(6,3) DEFAULT 1.00 NOT NULL,
    max_weight numeric(5,2) DEFAULT 20.00 NOT NULL,
    min_liquidity numeric(18,2) DEFAULT 500000 NOT NULL,
    leftover_account_id uuid
);


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    reconciled_on date NOT NULL,
    bank_balance numeric(14,2) NOT NULL,
    app_balance numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    amount numeric(14,2) NOT NULL,
    due_day smallint NOT NULL,
    category_id uuid NOT NULL,
    account_id uuid NOT NULL,
    urgency public.bill_urgency DEFAULT 'important'::public.bill_urgency NOT NULL,
    varies boolean DEFAULT false NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recurring_bills_dia_valido CHECK (((due_day >= 1) AND (due_day <= 31))),
    CONSTRAINT recurring_bills_nome_nao_vazio CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT recurring_bills_valor_positivo CHECK ((amount > (0)::numeric)),
    CONSTRAINT recurring_bills_vigencia CHECK (((valid_until IS NULL) OR (valid_until >= valid_from)))
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
    settles_invoice_month date,
    funds_expense_id uuid,
    recurring_bill_id uuid,
    goal_movement public.goal_movement,
    CONSTRAINT transactions_categoria_exceto_transferencia CHECK (((kind = 'transfer'::public.transaction_kind) = (category_id IS NULL))),
    CONSTRAINT transactions_finalidade_casa_com_sinal CHECK (((goal_movement IS NULL) OR ((goal_movement = 'repayment'::public.goal_movement) AND (amount > (0)::numeric)) OR ((goal_movement = ANY (ARRAY['use'::public.goal_movement, 'loan'::public.goal_movement, 'withdrawal'::public.goal_movement])) AND (amount < (0)::numeric)))),
    CONSTRAINT transactions_finalidade_so_em_transferencia CHECK (((goal_movement IS NULL) OR (kind = 'transfer'::public.transaction_kind))),
    CONSTRAINT transactions_invoice_month_e_primeiro_dia CHECK (((invoice_month IS NULL) OR (EXTRACT(day FROM invoice_month) = (1)::numeric))),
    CONSTRAINT transactions_parcelamento_coerente CHECK ((((installment_no IS NULL) = (installment_total IS NULL)) AND ((installment_no IS NULL) = (installment_group_id IS NULL)) AND ((installment_no IS NULL) OR ((installment_no >= 1) AND (installment_total >= 2) AND (installment_no <= installment_total))))),
    CONSTRAINT transactions_settles_invoice_month_e_primeiro_dia CHECK (((settles_invoice_month IS NULL) OR (EXTRACT(day FROM settles_invoice_month) = (1)::numeric))),
    CONSTRAINT transactions_sinal_casa_com_tipo CHECK ((((kind = 'income'::public.transaction_kind) AND (amount > (0)::numeric)) OR ((kind = 'expense'::public.transaction_kind) AND (amount < (0)::numeric)) OR (kind = 'transfer'::public.transaction_kind))),
    CONSTRAINT transactions_transfer_id_so_em_transferencia CHECK (((kind = 'transfer'::public.transaction_kind) = (transfer_id IS NOT NULL))),
    CONSTRAINT transactions_valor_nao_zero CHECK ((amount <> (0)::numeric))
);


--
-- Name: COLUMN transactions.settles_invoice_month; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.settles_invoice_month IS 'Mês de vencimento da fatura que esta perna de pagamento quita (ADR-010). Só em perna de transferência de entrada numa conta de cartão. Anulável: crédito no cartão sem fatura apontada é estorno, não pagamento. Continua sem invoice_month, porque pagamento não é compra (ADR-007).';


--
-- Name: COLUMN transactions.funds_expense_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.funds_expense_id IS 'Na perna de saída de um cofrinho: a despesa que este resgate pagou (modalidade "do cofrinho", ADR-014). Nulo em todo o resto.';


--
-- Name: COLUMN transactions.goal_movement; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.goal_movement IS 'Na perna que mexe no cofrinho: saída com finalidade (use, loan, withdrawal) ou entrada que devolve um empréstimo (repayment). RF18.';


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
-- Name: allocation_targets allocation_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_targets
    ADD CONSTRAINT allocation_targets_pkey PRIMARY KEY (user_id, class);


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
-- Name: asset_quotes asset_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_quotes
    ADD CONSTRAINT asset_quotes_pkey PRIMARY KEY (ticker, quoted_on);


--
-- Name: asset_trades asset_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_trades
    ADD CONSTRAINT asset_trades_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_ticker_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_ticker_unico UNIQUE (user_id, ticker);


--
-- Name: assets assets_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_user_id_id UNIQUE (user_id, id);


--
-- Name: attention_snoozes attention_snoozes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_snoozes
    ADD CONSTRAINT attention_snoozes_pkey PRIMARY KEY (user_id, item_key);


--
-- Name: budget_adjustments budget_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_adjustments
    ADD CONSTRAINT budget_adjustments_pkey PRIMARY KEY (id);


--
-- Name: budget_adjustments budget_adjustments_um_por_mes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_adjustments
    ADD CONSTRAINT budget_adjustments_um_por_mes UNIQUE (category_id, month);


--
-- Name: budget_templates budget_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_pkey PRIMARY KEY (id);


--
-- Name: budget_templates budget_templates_uma_vigencia_por_mes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_uma_vigencia_por_mes UNIQUE (category_id, valid_from);


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
-- Name: expected_incomes expected_incomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_incomes
    ADD CONSTRAINT expected_incomes_pkey PRIMARY KEY (id);


--
-- Name: goal_contributions goal_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_contributions
    ADD CONSTRAINT goal_contributions_pkey PRIMARY KEY (id);


--
-- Name: goal_contributions goal_contributions_sem_sobreposicao; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_contributions
    ADD CONSTRAINT goal_contributions_sem_sobreposicao EXCLUDE USING gist (account_id WITH =, vigencia WITH &&);


--
-- Name: goal_settings goal_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_settings
    ADD CONSTRAINT goal_settings_pkey PRIMARY KEY (account_id);


--
-- Name: investment_rules investment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_rules
    ADD CONSTRAINT investment_rules_pkey PRIMARY KEY (user_id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: recurring_bills recurring_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_pkey PRIMARY KEY (id);


--
-- Name: recurring_bills recurring_bills_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_user_id_id UNIQUE (user_id, id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_user_id_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_id UNIQUE (user_id, id);


--
-- Name: app_users_um_demo_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_um_demo_ativo ON public.app_users USING btree (is_demo) WHERE (is_demo AND active);


--
-- Name: categories_um_cofrinho_por_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_um_cofrinho_por_categoria ON public.categories USING btree (goal_account_id) WHERE (goal_account_id IS NOT NULL);


--
-- Name: transactions_custeio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_custeio ON public.transactions USING btree (funds_expense_id) WHERE (funds_expense_id IS NOT NULL);


--
-- Name: transactions_mes_do_orcamento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_mes_do_orcamento ON public.transactions USING btree (user_id, public.mes_do_orcamento(occurred_on, invoice_month)) WHERE (kind = ANY (ARRAY['income'::public.transaction_kind, 'expense'::public.transaction_kind]));


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
-- Name: transactions_user_quita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_quita ON public.transactions USING btree (user_id, settles_invoice_month) WHERE (settles_invoice_month IS NOT NULL);


--
-- Name: accounts accounts_cofrinho_em_uso; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounts_cofrinho_em_uso BEFORE UPDATE OF kind ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.accounts_cofrinho_em_uso_tg();


--
-- Name: categories categories_cofrinho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_cofrinho BEFORE INSERT OR UPDATE OF nature, goal_account_id ON public.categories FOR EACH ROW EXECUTE FUNCTION public.categories_cofrinho_tg();


--
-- Name: goal_contributions goal_contributions_conta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER goal_contributions_conta BEFORE INSERT OR UPDATE OF account_id ON public.goal_contributions FOR EACH ROW EXECUTE FUNCTION public.goal_contributions_conta_tg();


--
-- Name: transactions transactions_custeio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER transactions_custeio AFTER INSERT OR UPDATE ON public.transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.transactions_custeio_tg();


--
-- Name: transactions transactions_invoice_month; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transactions_invoice_month BEFORE INSERT OR UPDATE OF kind, account_id, occurred_on, installment_no, invoice_month, amount, settles_invoice_month ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.transactions_invoice_month_tg();


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
-- Name: allocation_targets allocation_targets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_targets
    ADD CONSTRAINT allocation_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: asset_trades asset_trades_ativo_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_trades
    ADD CONSTRAINT asset_trades_ativo_fk FOREIGN KEY (user_id, asset_id) REFERENCES public.assets(user_id, id) ON DELETE CASCADE;


--
-- Name: asset_trades asset_trades_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_trades
    ADD CONSTRAINT asset_trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: assets assets_conta_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;


--
-- Name: assets assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: attention_snoozes attention_snoozes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_snoozes
    ADD CONSTRAINT attention_snoozes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: budget_adjustments budget_adjustments_categoria_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_adjustments
    ADD CONSTRAINT budget_adjustments_categoria_fk FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE CASCADE;


--
-- Name: budget_adjustments budget_adjustments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_adjustments
    ADD CONSTRAINT budget_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: budget_templates budget_templates_categoria_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_categoria_fk FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE CASCADE;


--
-- Name: budget_templates budget_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: categories categories_goal_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_goal_fk FOREIGN KEY (user_id, goal_account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;


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
-- Name: expected_incomes expected_incomes_categoria_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_incomes
    ADD CONSTRAINT expected_incomes_categoria_fk FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE RESTRICT;


--
-- Name: expected_incomes expected_incomes_conta_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_incomes
    ADD CONSTRAINT expected_incomes_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;


--
-- Name: expected_incomes expected_incomes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expected_incomes
    ADD CONSTRAINT expected_incomes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: goal_contributions goal_contributions_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_contributions
    ADD CONSTRAINT goal_contributions_account_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE CASCADE;


--
-- Name: goal_contributions goal_contributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_contributions
    ADD CONSTRAINT goal_contributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: goal_settings goal_settings_conta_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_settings
    ADD CONSTRAINT goal_settings_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE CASCADE;


--
-- Name: goal_settings goal_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_settings
    ADD CONSTRAINT goal_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: investment_rules investment_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investment_rules
    ADD CONSTRAINT investment_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: reconciliations reconciliations_conta_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE CASCADE;


--
-- Name: reconciliations reconciliations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: recurring_bills recurring_bills_categoria_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_categoria_fk FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE RESTRICT;


--
-- Name: recurring_bills recurring_bills_conta_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;


--
-- Name: recurring_bills recurring_bills_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


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
-- Name: transactions transactions_funds_expense_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_funds_expense_fk FOREIGN KEY (user_id, funds_expense_id) REFERENCES public.transactions(user_id, id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_recurring_bill_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_recurring_bill_fk FOREIGN KEY (user_id, recurring_bill_id) REFERENCES public.recurring_bills(user_id, id) ON DELETE SET NULL (recurring_bill_id);


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
-- Name: allocation_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allocation_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: allocation_targets allocation_targets_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allocation_targets_isolamento ON public.allocation_targets TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_isolamento ON public.app_users TO app USING ((id = public.current_app_user())) WITH CHECK ((id = public.current_app_user()));


--
-- Name: asset_trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_trades ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_trades asset_trades_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_trades_isolamento ON public.asset_trades TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_isolamento ON public.assets TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: attention_snoozes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attention_snoozes ENABLE ROW LEVEL SECURITY;

--
-- Name: attention_snoozes attention_snoozes_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attention_snoozes_isolamento ON public.attention_snoozes TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: budget_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_adjustments budget_adjustments_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY budget_adjustments_isolamento ON public.budget_adjustments TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: budget_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budget_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_templates budget_templates_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY budget_templates_isolamento ON public.budget_templates TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


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
-- Name: expected_incomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expected_incomes ENABLE ROW LEVEL SECURITY;

--
-- Name: expected_incomes expected_incomes_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expected_incomes_isolamento ON public.expected_incomes TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: goal_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_contributions goal_contributions_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_contributions_isolamento ON public.goal_contributions TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: goal_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_settings goal_settings_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY goal_settings_isolamento ON public.goal_settings TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: investment_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investment_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: investment_rules investment_rules_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY investment_rules_isolamento ON public.investment_rules TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliations reconciliations_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reconciliations_isolamento ON public.reconciliations TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


--
-- Name: recurring_bills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_bills recurring_bills_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recurring_bills_isolamento ON public.recurring_bills TO app USING ((user_id = public.current_app_user())) WITH CHECK ((user_id = public.current_app_user()));


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
-- Name: FUNCTION admin_list_app_users(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_list_app_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_app_users() TO app;


--
-- Name: FUNCTION demo_app_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.demo_app_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.demo_app_user() TO app;


--
-- Name: FUNCTION mes_do_orcamento(p_occurred_on date, p_invoice_month date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mes_do_orcamento(p_occurred_on date, p_invoice_month date) TO app;


--
-- Name: FUNCTION previsto_do_mes(p_mes date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.previsto_do_mes(p_mes date) TO app;


--
-- Name: FUNCTION resolve_app_user(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_app_user(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_app_user(p_email text) TO app;


--
-- Name: FUNCTION tickers_em_carteira(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tickers_em_carteira() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tickers_em_carteira() TO jobs;


--
-- Name: TABLE account_terms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_terms TO app;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts TO app;


--
-- Name: TABLE allocation_targets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.allocation_targets TO app;


--
-- Name: TABLE app_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_users TO app;


--
-- Name: TABLE asset_quotes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.asset_quotes TO app;
GRANT SELECT,INSERT,UPDATE ON TABLE public.asset_quotes TO jobs;


--
-- Name: TABLE asset_trades; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.asset_trades TO app;


--
-- Name: TABLE assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assets TO app;


--
-- Name: TABLE attention_snoozes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.attention_snoozes TO app;


--
-- Name: TABLE budget_adjustments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.budget_adjustments TO app;


--
-- Name: TABLE budget_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.budget_templates TO app;


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
-- Name: TABLE expected_incomes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.expected_incomes TO app;


--
-- Name: TABLE goal_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_contributions TO app;


--
-- Name: TABLE goal_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_settings TO app;


--
-- Name: TABLE investment_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.investment_rules TO app;


--
-- Name: TABLE reconciliations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reconciliations TO app;


--
-- Name: TABLE recurring_bills; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.recurring_bills TO app;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.transactions TO app;


--
-- PostgreSQL database dump complete
--
