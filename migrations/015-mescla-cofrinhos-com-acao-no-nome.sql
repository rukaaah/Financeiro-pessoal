-- Migration 015 — mescla os cofrinhos criados com a ação no nome (2026-11-08).
--
-- A leitura do extrato pela IA (PR #50) criou cofrinhos como "Jogos · Dinheiro
-- guardado" e "Jogos · Dinheiro resgatado": a ação virou parte do nome, e cada
-- sentido virou um cofrinho. Aqui cada um desses volta a ser o cofrinho "Jogos":
--   - se já existe um cofrinho com o nome limpo, os lançamentos e o resto que
--     aponta para o duplicado passam para ele, e o duplicado é apagado;
--   - se não existe, o primeiro duplicado (mais antigo) só é renomeado.
-- Só dados mudam; o esquema é o mesmo. O workflow migrar-banco cria um branch de
-- backup do Neon antes de aplicar, e é ele que desfaz isto se preciso.

DO $$
DECLARE
    dup record;
    alvo uuid;
BEGIN
    FOR dup IN
        SELECT a.id, a.user_id, a.name,
               btrim(coalesce(
                   substring(a.name FROM '(?i)^(.+?)\s*[·|•]\s*dinheiro\s+(?:guardado|resgatado)$'),
                   substring(a.name FROM '(?i)^dinheiro\s+(?:guardado|resgatado)\s*[·|•]\s*(.+)$'))) AS limpo
          FROM accounts a
         WHERE a.kind = 'goal'
           AND (a.name ~* '^.+?\s*[·|•]\s*dinheiro\s+(guardado|resgatado)$'
             OR a.name ~* '^dinheiro\s+(guardado|resgatado)\s*[·|•]\s*.+$')
         ORDER BY a.user_id, a.created_at, a.id
    LOOP
        CONTINUE WHEN dup.limpo IS NULL OR dup.limpo = '';

        SELECT g.id INTO alvo
          FROM accounts g
         WHERE g.user_id = dup.user_id AND g.kind = 'goal' AND g.id <> dup.id
           AND lower(g.name) = lower(dup.limpo)
         ORDER BY g.active DESC, g.created_at
         LIMIT 1;

        IF alvo IS NULL THEN
            -- Nome limpo livre (nenhuma conta, de tipo nenhum, usa): só renomeia.
            IF NOT EXISTS (SELECT 1 FROM accounts o WHERE o.user_id = dup.user_id AND o.name = dup.limpo) THEN
                UPDATE accounts SET name = dup.limpo, active = true WHERE id = dup.id;
            END IF;
            CONTINUE;
        END IF;

        UPDATE transactions       SET account_id = alvo      WHERE account_id = dup.id;
        UPDATE goal_contributions SET account_id = alvo      WHERE account_id = dup.id;
        UPDATE categories         SET goal_account_id = alvo WHERE goal_account_id = dup.id;
        UPDATE recurring_bills    SET account_id = alvo      WHERE account_id = dup.id;
        UPDATE expected_incomes   SET account_id = alvo      WHERE account_id = dup.id;
        UPDATE assets             SET account_id = alvo      WHERE account_id = dup.id;
        -- A meta do duplicado só passa se o cofrinho certo ainda não tem uma.
        IF NOT EXISTS (SELECT 1 FROM goal_settings WHERE account_id = alvo) THEN
            UPDATE goal_settings SET account_id = alvo WHERE account_id = dup.id;
        END IF;
        DELETE FROM accounts WHERE id = dup.id;
    END LOOP;
END $$;
