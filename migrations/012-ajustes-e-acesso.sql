-- Migration 012 — regras de categorização e gestão de acesso (RF05, RF19).
--
-- Gestão de acesso: só quem administra adiciona, desativa e reativa pessoas, e a
-- regra vale no banco (funções SECURITY DEFINER que checam is_admin por dentro),
-- não na tela. Toda mudança fica em access_log.

CREATE TABLE categorization_rules (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    contains    text        NOT NULL,
    category_id uuid        NOT NULL,
    priority    smallint    NOT NULL DEFAULT 50,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT categorization_rules_texto CHECK (length(btrim(contains)) >= 2),
    CONSTRAINT categorization_rules_categoria_fk
        FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE
);

CREATE TABLE access_log (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id   uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    action     text        NOT NULL,
    target     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT access_log_acao CHECK (action IN ('adicionou', 'desativou', 'reativou'))
);

ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorization_rules_isolamento ON categorization_rules
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON categorization_rules TO app;

-- access_log não tem user_id: só é lido e escrito pelas funções abaixo.
ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION exige_admin() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
    AS $$
DECLARE v uuid := current_app_user();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.app_users u WHERE u.id = v AND u.is_admin AND u.active) THEN
        RAISE EXCEPTION 'esta operação é só para quem administra o app (RF19)' USING ERRCODE = '42501';
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION admin_add_app_user(p_email text, p_nome text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
    AS $$
DECLARE v_admin uuid := exige_admin(); v_id uuid;
BEGIN
    INSERT INTO public.app_users (email, display_name) VALUES (lower(btrim(p_email)), btrim(p_nome)) RETURNING id INTO v_id;
    INSERT INTO public.access_log (actor_id, action, target) VALUES (v_admin, 'adicionou', lower(btrim(p_email)));
    RETURN v_id;
END $$;

CREATE FUNCTION admin_set_active(p_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
    AS $$
DECLARE v_admin uuid := exige_admin(); v_email text;
BEGIN
    IF p_id = v_admin AND NOT p_active THEN
        RAISE EXCEPTION 'quem administra não desativa a si mesmo' USING ERRCODE = '42501';
    END IF;
    UPDATE public.app_users SET active = p_active WHERE id = p_id AND NOT is_demo RETURNING email INTO v_email;
    IF v_email IS NULL THEN RAISE EXCEPTION 'pessoa não encontrada' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.access_log (actor_id, action, target) VALUES (v_admin, CASE WHEN p_active THEN 'reativou' ELSE 'desativou' END, v_email);
END $$;

CREATE FUNCTION admin_access_log() RETURNS TABLE (quando timestamptz, quem text, acao text, alvo text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
    AS $$
BEGIN
    PERFORM exige_admin();
    RETURN QUERY SELECT l.created_at, u.email, l.action, l.target FROM public.access_log l JOIN public.app_users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION exige_admin(), admin_add_app_user(text, text), admin_set_active(uuid, boolean), admin_access_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_add_app_user(text, text), admin_set_active(uuid, boolean), admin_access_log() TO app;
