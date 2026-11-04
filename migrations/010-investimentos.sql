-- Migration 010 — carteira de investimentos (RF09, RF10, RF11, RF15).
--
-- A posição de cada ativo sai das operações (compra e venda), nunca de um número
-- digitado: quantidade e preço médio são calculados. Cotação, P/VP, DY e liquidez
-- são dados de mercado, iguais para todos, gravados pelo job diário com o papel
-- `jobs` (Investidor10, uso permitido; Tesouro por fonte oficial).

CREATE TYPE asset_class AS ENUM ('paper', 'brick', 'logistics', 'infra', 'treasury', 'other');

CREATE TABLE assets (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    ticker      text        NOT NULL,
    name        text        NOT NULL,
    class       asset_class NOT NULL,
    account_id  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT assets_ticker_formato CHECK (ticker ~ '^[A-Z0-9 ]{3,30}$'),
    CONSTRAINT assets_ticker_unico UNIQUE (user_id, ticker),
    CONSTRAINT assets_user_id_id UNIQUE (user_id, id),
    CONSTRAINT assets_conta_fk FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE RESTRICT
);

CREATE TABLE asset_trades (
    id          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid           NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    asset_id    uuid           NOT NULL,
    traded_on   date           NOT NULL,
    quantity    numeric(18, 6) NOT NULL,
    unit_price  numeric(14, 6) NOT NULL,
    created_at  timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT asset_trades_quantidade_nao_zero CHECK (quantity <> 0),
    CONSTRAINT asset_trades_preco_positivo CHECK (unit_price > 0),
    CONSTRAINT asset_trades_ativo_fk FOREIGN KEY (user_id, asset_id) REFERENCES assets (user_id, id) ON DELETE CASCADE
);

COMMENT ON COLUMN asset_trades.quantity IS 'Positiva na compra, negativa na venda.';

-- Dado de mercado: sem user_id, legível por todos os usuários, escrito só pelo job.
CREATE TABLE asset_quotes (
    ticker      text           NOT NULL,
    quoted_on   date           NOT NULL,
    price       numeric(14, 6) NOT NULL,
    pvp         numeric(8, 4),
    dy_12m      numeric(8, 4),
    liquidity   numeric(18, 2),
    source      text           NOT NULL,
    fetched_at  timestamptz    NOT NULL DEFAULT now(),
    PRIMARY KEY (ticker, quoted_on)
);

CREATE TABLE investment_rules (
    user_id       uuid           PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
    max_pvp       numeric(6, 3)  NOT NULL DEFAULT 1.00,
    max_weight    numeric(5, 2)  NOT NULL DEFAULT 20.00,
    min_liquidity numeric(18, 2) NOT NULL DEFAULT 500000,
    leftover_account_id uuid
);

CREATE TABLE allocation_targets (
    user_id  uuid          NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    class    asset_class   NOT NULL,
    percent  numeric(5, 2) NOT NULL,
    PRIMARY KEY (user_id, class),
    CONSTRAINT allocation_targets_percentual CHECK (percent BETWEEN 0 AND 100)
);

-- Tickers em carteira de alguém: o job precisa saber o que buscar sem ler a carteira
-- de ninguém. SECURITY DEFINER, devolvendo só o ticker.
CREATE FUNCTION tickers_em_carteira() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT ticker FROM assets WHERE class <> 'treasury' ORDER BY 1 $$;

ALTER TABLE assets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_trades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY assets_isolamento ON assets
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY asset_trades_isolamento ON asset_trades
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY investment_rules_isolamento ON investment_rules
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY allocation_targets_isolamento ON allocation_targets
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON assets, asset_trades, investment_rules, allocation_targets TO app;
GRANT SELECT ON asset_quotes TO app;
GRANT SELECT, INSERT, UPDATE ON asset_quotes TO jobs;
REVOKE ALL ON FUNCTION tickers_em_carteira() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tickers_em_carteira() TO jobs;
