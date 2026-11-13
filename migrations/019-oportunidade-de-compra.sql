-- Migration 019 — medidor diário de oportunidade de compra de FII (ADR-022).
--
-- Dado de mercado, como fii_insights: sem user_id, lido por todos, escrito só pelo job.
-- A tela mostra só os tickers da carteira de quem pede (RLS em assets) e calcula as
-- cotas sugeridas com o aporte e as regras do próprio usuário.

CREATE TABLE fii_opportunities (
    ticker       text           NOT NULL,
    day          date           NOT NULL,
    price        numeric(14, 6) NOT NULL,
    score        smallint,
    percentile   smallint,
    trading_days smallint       NOT NULL,
    verdict      text           NOT NULL,
    reason       text           NOT NULL,
    risks        jsonb          NOT NULL DEFAULT '[]',
    outlook      text           NOT NULL DEFAULT '',
    target_price numeric(14, 2),
    facts        jsonb          NOT NULL DEFAULT '{}',
    model        text,          -- null quando o texto saiu só da conta, sem IA
    generated_at timestamptz    NOT NULL DEFAULT now(),
    PRIMARY KEY (ticker, day),
    CONSTRAINT fii_opportunities_veredito CHECK (verdict IN ('grande_dia', 'bom_preco', 'esperar', 'sem_dados')),
    CONSTRAINT fii_opportunities_nota CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT fii_opportunities_riscos CHECK (jsonb_typeof(risks) = 'array')
);

CREATE TABLE fii_market_daily (
    day              date          PRIMARY KEY,
    trend            text          NOT NULL,
    funds            smallint      NOT NULL,
    above_average    smallint      NOT NULL,
    median_change_21 numeric(8, 2),
    rising           text[]        NOT NULL DEFAULT '{}',
    falling          text[]        NOT NULL DEFAULT '{}',
    selic            numeric(6, 2),
    selic_direction  text,
    generated_at     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT fii_market_daily_tendencia CHECK (trend IN ('alta', 'queda', 'lateral', 'sem_dados'))
);

GRANT SELECT ON fii_opportunities, fii_market_daily TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON fii_opportunities, fii_market_daily TO jobs;
