-- Migration 017 — notícias e insights dos FIIs em carteira (ADR-021).
--
-- Documentos oficiais que cada fundo publica no Fundos.NET da B3 (fato relevante,
-- comunicado, aviso aos cotistas, relatório gerencial, oferta, assembleia) e o resumo
-- que a IA faz deles. Dado de mercado, como fii_reports: sem user_id, lido por todos,
-- escrito só pelo job. A tela só mostra os tickers da carteira de quem pede (RLS em assets).

CREATE TABLE fii_documents (
    ticker       text        NOT NULL,
    id           bigint      NOT NULL,  -- id do documento no Fundos.NET
    category     text        NOT NULL,
    title        text        NOT NULL,
    ref_date     date,
    delivered_at timestamptz NOT NULL,
    content      text        NOT NULL DEFAULT '',
    fetched_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ticker, id)
);

CREATE INDEX fii_documents_recentes ON fii_documents (ticker, delivered_at DESC);

CREATE TABLE fii_insights (
    ticker       text        PRIMARY KEY,
    summary      text        NOT NULL,
    prepare      jsonb       NOT NULL DEFAULT '[]',
    events       jsonb       NOT NULL DEFAULT '[]',
    documents    bigint[]    NOT NULL,
    model        text        NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fii_insights_prepare_lista CHECK (jsonb_typeof(prepare) = 'array'),
    CONSTRAINT fii_insights_events_lista CHECK (jsonb_typeof(events) = 'array')
);

GRANT SELECT ON fii_documents, fii_insights TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON fii_documents, fii_insights TO jobs;
