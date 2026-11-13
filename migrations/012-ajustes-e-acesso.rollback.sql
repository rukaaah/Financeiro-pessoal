-- Reverte a migration 012.

DROP FUNCTION IF EXISTS admin_access_log();
DROP FUNCTION IF EXISTS admin_set_active(uuid, boolean);
DROP FUNCTION IF EXISTS admin_add_app_user(text, text);
DROP FUNCTION IF EXISTS exige_admin();
DROP TABLE IF EXISTS access_log;
DROP TABLE IF EXISTS categorization_rules;
