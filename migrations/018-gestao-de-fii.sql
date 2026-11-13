-- Migration 018 — comportamento da gestão dos FIIs em carteira (ADR-021).
--
-- O que a gestão diz que vai fazer e onde mudou de ideia, lido pela IA nos relatórios
-- gerenciais guardados em fii_documents. Cada plano e cada mudança traz o trecho
-- copiado do documento citado (validado no job). Dado de mercado: sem user_id, lido
-- por todos, escrito só pelo job.

CREATE TABLE fii_management (
    ticker       text        PRIMARY KEY,
    management   jsonb       NOT NULL,
    documents    bigint[]    NOT NULL,
    model        text        NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fii_management_objeto CHECK (jsonb_typeof(management) = 'object')
);

GRANT SELECT ON fii_management TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON fii_management TO jobs;
