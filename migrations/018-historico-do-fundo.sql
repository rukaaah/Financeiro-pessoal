-- Migration 018 — histórico de funcionamento dos FIIs e fundos acompanhados.
--
-- O informe mensal da CVM (ADR-020) já é baixado pelo job de cotações. Esta migration
-- guarda mais três colunas do arquivo "geral"/"complemento" por mês (cotas emitidas,
-- cotistas e patrimônio líquido) e o perfil do fundo (início de funcionamento,
-- segmento, mandato, tipo de gestão). Dado de mercado: sem user_id, lido por todos.
--
-- asset_watchlist: fundos que a pessoa marcou para acompanhar antes de comprar. Entram
-- em tickers_em_carteira(), então os jobs passam a buscar cotação, informe e notícias
-- deles também.

ALTER TABLE fii_reports
    ADD COLUMN shares_outstanding numeric(20, 0),
    ADD COLUMN shareholders       integer,
    ADD COLUMN net_assets         numeric(18, 2);

CREATE TABLE fii_profiles (
    ticker      text        PRIMARY KEY,
    cnpj        text        NOT NULL,
    name        text,
    started_on  date,
    segment     text,
    mandate     text,
    management  text,
    fetched_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON fii_profiles TO app;
GRANT SELECT, INSERT, UPDATE ON fii_profiles TO jobs;

CREATE TABLE asset_watchlist (
    user_id    uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    ticker     text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, ticker),
    CONSTRAINT asset_watchlist_ticker_formato CHECK (ticker ~ '^[A-Z]{4}[0-9]{2}$')
);

ALTER TABLE asset_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_watchlist_isolamento ON asset_watchlist
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
GRANT SELECT, INSERT, DELETE ON asset_watchlist TO app;

CREATE OR REPLACE FUNCTION tickers_em_carteira() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT ticker FROM assets WHERE class <> 'treasury'
          UNION SELECT ticker FROM asset_watchlist ORDER BY 1 $$;
