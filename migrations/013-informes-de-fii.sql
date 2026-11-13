-- Migration 013 — informes mensais de FII (ADR-020).
--
-- Indicadores de FII por fontes oficiais (ADR-020): o informe mensal da CVM guarda o
-- valor patrimonial da cota e o DY do mês; o job calcula P/VP e DY 12m com o preço
-- da B3 ou da brapi. Dado de mercado: sem user_id, lido por todos, escrito só pelo job.

CREATE TABLE fii_reports (
    ticker        text           NOT NULL,
    ref_month     date           NOT NULL,
    cnpj          text           NOT NULL,
    nav_per_share numeric(18, 6) NOT NULL,
    dy_month      numeric(10, 6) NOT NULL,
    fetched_at    timestamptz    NOT NULL DEFAULT now(),
    PRIMARY KEY (ticker, ref_month),
    CONSTRAINT fii_reports_mes CHECK (ref_month = date_trunc('month', ref_month)::date)
);

GRANT SELECT ON fii_reports TO app;
GRANT SELECT, INSERT, UPDATE ON fii_reports TO jobs;
