CREATE OR REPLACE FUNCTION tickers_em_carteira() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT DISTINCT ticker FROM assets WHERE class <> 'treasury' ORDER BY 1 $$;
DROP TABLE IF EXISTS asset_watchlist;
DROP TABLE IF EXISTS fii_profiles;
ALTER TABLE fii_reports
    DROP COLUMN IF EXISTS net_assets,
    DROP COLUMN IF EXISTS shareholders,
    DROP COLUMN IF EXISTS shares_outstanding;
