-- Migration 001 — identidade e o padrão de RLS.
--
-- Estabelece o alicerce que toda tabela de dados da 002 em diante vai repetir:
-- os três papéis, a tabela de usuários, a função que lê o usuário da transação
-- e o formato das policies.
--
-- Referências: ADR-003 (login + allowlist) e ADR-004 (RLS por SET LOCAL).

-- ------------------------------------------------------------------ papéis
--
-- `owner`  aplica migrations e é dono dos objetos. Não é usado pela aplicação.
-- `app`    é o papel do Streamlit. Sem BYPASSRLS: é o ponto central do ADR-004.
-- `jobs`   é o papel dos GitHub Actions. Recebe acesso só às tabelas dos jobs,
--          que ainda não existem — por isso aqui ele nasce sem nenhum GRANT.
--
-- Os dois nascem SEM SENHA, de propósito: este repositório é público e nenhuma
-- credencial pode passar por ele. Um papel LOGIN sem senha não autentica com
-- scram-sha-256. A senha é definida fora do versionamento, no console do Neon
-- ou por um ALTER ROLE manual.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
        CREATE ROLE app LOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jobs') THEN
        CREATE ROLE jobs LOGIN;
    END IF;
END
$$;

-- Idempotente e explícito: garante o estado mesmo se o papel já tiver sido
-- criado à mão no console do Neon com outros atributos.
ALTER ROLE app  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE jobs NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO app, jobs;
REVOKE CREATE ON SCHEMA public FROM app, jobs;

-- ------------------------------------------------------------- current_app_user
--
-- Lê o usuário que a aplicação fixou com `SET LOCAL app.user_id` no início da
-- transação. Retorna NULL quando não foi definido, em vez de levantar erro:
-- as policies então não casam com linha nenhuma e a consulta volta vazia.
-- É a propriedade do ADR-004 — esquecer o SET LOCAL devolve nada, nunca dado
-- de outra pessoa.
--
-- Um valor presente mas inválido levanta erro no cast, de propósito: isso é
-- bug de programação, não ausência de contexto, e deve falhar alto.

CREATE FUNCTION current_app_user() RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

COMMENT ON FUNCTION current_app_user() IS
    'Usuário da transação corrente, vindo de SET LOCAL app.user_id. NULL quando '
    'não definido, para que as policies de RLS não retornem nada (ADR-004).';

-- ------------------------------------------------------------------ app_users
--
-- A allowlist do ADR-003. E-mail guardado sempre em minúsculas (CHECK abaixo),
-- o que dispensa a extensão citext e mantém a unicidade insensível a caixa.

CREATE TABLE app_users (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text        NOT NULL UNIQUE,
    display_name text        NOT NULL,
    is_demo      boolean     NOT NULL DEFAULT false,
    active       boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT app_users_email_minusculo CHECK (email = lower(email)),
    CONSTRAINT app_users_email_formato
        CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT app_users_display_name_nao_vazio
        CHECK (length(btrim(display_name)) > 0)
);

COMMENT ON TABLE app_users IS
    'Allowlist de acesso (ADR-003). E-mail ausente aqui cai no modo demo.';

-- No máximo um usuário demo ativo: o roteamento do ADR-003 precisa de um alvo
-- determinístico quando o visitante não está na allowlist.
CREATE UNIQUE INDEX app_users_um_demo_ativo
    ON app_users (is_demo)
    WHERE is_demo AND active;

-- ------------------------------------------------------------------ RLS
--
-- O padrão que a migration 002 vai repetir em cada tabela de dados:
--
--     ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY <t>_isolamento ON <t> FOR ALL TO app
--         USING (user_id = current_app_user())
--         WITH CHECK (user_id = current_app_user());
--
-- Em app_users a coluna é `id`, porque esta é a própria tabela de usuários.
--
-- USING filtra a leitura; WITH CHECK impede escrever linha de outra pessoa.
-- Sem WITH CHECK, um UPDATE conseguiria mover uma linha para outro user_id.

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_users_isolamento ON app_users
    FOR ALL
    TO app
    USING (id = current_app_user())
    WITH CHECK (id = current_app_user());

GRANT SELECT ON app_users TO app;

-- --------------------------------------------------------- resolução de login
--
-- Problema de ovo e galinha: a policy acima depende de `app.user_id`, mas no
-- momento do login a aplicação só tem o e-mail — ainda não sabe o id.
--
-- A saída é uma função SECURITY DEFINER, que roda como `owner` e portanto fora
-- da RLS. Ela é a única porta para esse dado, devolve apenas o uuid (nunca a
-- linha inteira) e só enxerga usuários ativos. É o ponto exato onde a decisão
-- "dono ou demo" do ADR-003 acontece.

CREATE FUNCTION resolve_app_user(p_email text) RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    SELECT id FROM public.app_users WHERE email = lower(p_email) AND active
$$;

COMMENT ON FUNCTION resolve_app_user(text) IS
    'E-mail verificado -> id do usuário ativo, ou NULL se não está na '
    'allowlist. SECURITY DEFINER porque roda antes de app.user_id existir.';

CREATE FUNCTION demo_app_user() RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    SELECT id FROM public.app_users WHERE is_demo AND active
$$;

COMMENT ON FUNCTION demo_app_user() IS
    'Id do usuário demo ativo, destino de quem não está na allowlist (ADR-003).';

-- SECURITY DEFINER exige fechar o acesso: por padrão o PostgreSQL concede
-- EXECUTE a PUBLIC em toda função nova.
REVOKE ALL ON FUNCTION resolve_app_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_app_user()        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_app_user(text) TO app;
GRANT EXECUTE ON FUNCTION demo_app_user()        TO app;
