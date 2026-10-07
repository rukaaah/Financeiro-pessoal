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


SET default_tablespace = '';

SET default_table_access_method = heap;

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
-- Name: app_users_um_demo_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_um_demo_ativo ON public.app_users USING btree (is_demo) WHERE (is_demo AND active);


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_isolamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_isolamento ON public.app_users TO app USING ((id = public.current_app_user())) WITH CHECK ((id = public.current_app_user()));


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
-- Name: TABLE app_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_users TO app;


--
-- PostgreSQL database dump complete
--
