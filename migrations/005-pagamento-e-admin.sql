-- Migration 005 — a perna de pagamento aponta a fatura que quita, e a
-- allowlist passa a distinguir quem administra.
--
-- Duas mudanças independentes, as duas aditivas: o app que está no ar continua
-- funcionando sem conhecer nenhuma das colunas novas.
--
--   1. transactions.settles_invoice_month  (ADR-010)
--   2. app_users.is_admin + leitura administrativa da allowlist  (RF19)
--
-- O que NÃO entra aqui, de propósito:
--
--   - a tabela do modelo recorrente de previsto. Está em ADR-013 como decisão
--     PENDENTE, com quatro perguntas abertas. Aplicar uma tabela meio pensada
--     aqui seria a terceira migration seguida mexendo na mesma estrutura, que é
--     exatamente o custo que o ADR-008 registrou ter pagado;
--   - a tabela `access_log` e as funções de ESCRITA da allowlist
--     (adicionar/desativar). Escrever na allowlist sem registrar quem escreveu
--     é metade do RF19, e a metade errada. As duas coisas entram juntas na
--     Fase 1.

-- ============================================================================
-- 1. A perna de pagamento aponta a fatura que quita (ADR-010)
-- ============================================================================
--
-- O ADR-007 deixou por escrito a pergunta que esta coluna responde: "saber se
-- uma fatura foi paga, e quanto ainda falta, [...] passa a exigir casar as
-- compras do ciclo com os pagamentos feitos".
--
-- Casar por janela de datas erra em quatro casos que não são exóticos:
-- pagamento atrasado, parcial, adiantado e estorno. Em todos falta a mesma
-- informação, e é uma que o usuário tem: ele sabe qual fatura está pagando,
-- porque é isso que o app do banco mostra. Então o app pergunta.

ALTER TABLE transactions
    ADD COLUMN settles_invoice_month date;

COMMENT ON COLUMN transactions.settles_invoice_month IS
    'Mês de vencimento da fatura que esta perna de pagamento quita (ADR-010). '
    'Só em perna de transferência de entrada numa conta de cartão. Anulável: '
    'crédito no cartão sem fatura apontada é estorno, não pagamento. Continua '
    'sem invoice_month, porque pagamento não é compra (ADR-007).';

-- Mesma convenção de invoice_month: primeiro dia do mês, para que as duas
-- colunas sejam comparáveis sem normalizar nada na consulta.
ALTER TABLE transactions
    ADD CONSTRAINT transactions_settles_invoice_month_e_primeiro_dia
    CHECK (settles_invoice_month IS NULL
           OR EXTRACT(DAY FROM settles_invoice_month) = 1);

-- "Quanto já foi pago da fatura de outubro?" é uma consulta de rotina da tela
-- de Cartões; o índice parcial a serve e quase não ocupa espaço, porque a
-- coluna é nula na enorme maioria das linhas.
CREATE INDEX transactions_user_quita
    ON transactions (user_id, settles_invoice_month)
    WHERE settles_invoice_month IS NOT NULL;

-- ---------------------------------------------------------------- trigger
--
-- O CHECK acima garante a forma do valor, não o contexto. Quem garante o
-- contexto é o trigger, pelo mesmo motivo do ADR-004: o invariante precisa
-- valer para todo caminho de escrita — app, importador e script de seed.

CREATE OR REPLACE FUNCTION transactions_invoice_month_tg() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind     account_kind;
    v_esperado date;
BEGIN
    SELECT kind INTO v_kind FROM accounts WHERE id = NEW.account_id;

    -- Quem quita uma fatura é, necessariamente, uma perna de transferência de
    -- entrada numa conta de cartão. Qualquer outra combinação é erro de quem
    -- escreveu, e falhar alto aqui é melhor que um total de fatura errado numa
    -- tela.
    IF NEW.settles_invoice_month IS NOT NULL THEN
        IF NEW.kind <> 'transfer' THEN
            RAISE EXCEPTION
                'só transferência quita fatura; este lançamento é % (ADR-010)',
                NEW.kind
                USING ERRCODE = '23F05';
        END IF;

        IF v_kind IS DISTINCT FROM 'credit_card' THEN
            RAISE EXCEPTION
                'só conta de cartão tem fatura a quitar; esta é % (ADR-010)',
                v_kind
                USING ERRCODE = '23F06';
        END IF;

        -- Na conta do cartão a compra é negativa e o pagamento é positivo: é o
        -- lado que reduz a dívida. A perna que sai da conta corrente não quita
        -- nada, ela só paga.
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION
                'a perna que quita a fatura é a de entrada no cartão, e esta é de % (ADR-010)',
                NEW.amount
                USING ERRCODE = '23F07';
        END IF;
    END IF;

    -- Perna de transferência numa conta de cartão é pagamento de fatura (ou
    -- estorno): move dinheiro, não é compra, e por isso não pertence a fatura
    -- nenhuma. Sem esta exceção, `sum(amount) GROUP BY invoice_month` mistura
    -- compras com pagamento e deixa de significar o total da fatura (ADR-007).
    IF NEW.kind = 'transfer' THEN
        IF NEW.invoice_month IS NOT NULL THEN
            RAISE EXCEPTION
                'transferência não tem mês de fatura: pagamento não é compra (ADR-007)'
                USING ERRCODE = '23F04';
        END IF;
        RETURN NEW;
    END IF;

    IF v_kind = 'credit_card' THEN
        v_esperado := invoice_month_for(
            NEW.account_id, NEW.occurred_on, NEW.installment_no
        );

        IF NEW.invoice_month IS NULL THEN
            NEW.invoice_month := v_esperado;
        ELSIF NEW.invoice_month <> v_esperado THEN
            RAISE EXCEPTION
                'invoice_month % não confere com o esperado % (ADR-005)',
                NEW.invoice_month, v_esperado
                USING ERRCODE = '23F02';
        END IF;
    ELSIF NEW.invoice_month IS NOT NULL THEN
        RAISE EXCEPTION
            'invoice_month só existe em conta de cartão; esta é %', v_kind
            USING ERRCODE = '23F03';
    END IF;

    RETURN NEW;
END
$$;

COMMENT ON FUNCTION transactions_invoice_month_tg() IS
    'Calcula e verifica invoice_month (ADR-005/008) e verifica o contexto de '
    'settles_invoice_month (ADR-010).';

-- `settles_invoice_month` entra na lista de colunas vigiadas: sem isso, um
-- UPDATE que só mexesse nela passaria sem validação.
DROP TRIGGER transactions_invoice_month ON transactions;
CREATE TRIGGER transactions_invoice_month
    BEFORE INSERT OR UPDATE OF
        kind, account_id, occurred_on, installment_no, invoice_month,
        amount, settles_invoice_month
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_invoice_month_tg();

-- ============================================================================
-- 2. Quem administra a allowlist (RF19)
-- ============================================================================

ALTER TABLE app_users
    ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app_users.is_admin IS
    'Pode liberar e desativar acesso de outras pessoas (RF19). A regra vale no '
    'banco, por função SECURITY DEFINER: esconder a tela não protege nada.';

-- O usuário demo é compartilhado por qualquer visitante não identificado
-- (ADR-003). Dar-lhe poder de administrar a allowlist seria entregar a porta a
-- quem está do lado de fora dela.
ALTER TABLE app_users
    ADD CONSTRAINT app_users_demo_nao_administra
    CHECK (NOT (is_demo AND is_admin));

-- O dono do sistema passa a administrar. É o único usuário não-demo que existe
-- hoje; se houver mais de um, esta linha promove todos, e é por isso que ela é
-- explícita sobre o critério em vez de usar um UPDATE sem WHERE.
UPDATE app_users SET is_admin = true WHERE NOT is_demo AND active;

-- ------------------------------------------------- leitura administrativa
--
-- A policy `app_users_isolamento` deixa cada usuário ver só a própria linha, o
-- que é certo e torna impossível montar a tela de Acesso: ela precisa listar
-- todo mundo. A saída é a mesma de `resolve_app_user` — uma função
-- SECURITY DEFINER, que roda como `owner` e portanto fora da RLS —, com a
-- diferença de que esta checa a permissão por dentro, antes de devolver dado.

CREATE FUNCTION admin_list_app_users()
    RETURNS TABLE (
        id           uuid,
        email        text,
        display_name text,
        is_demo      boolean,
        is_admin     boolean,
        active       boolean,
        created_at   timestamptz
    )
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
BEGIN
    -- `current_app_user()` lê app.user_id, que a unit of work define por
    -- transação (ADR-004). Sem isso, não há quem perguntar.
    IF NOT EXISTS (
        SELECT 1 FROM public.app_users u
         WHERE u.id = current_app_user() AND u.is_admin AND u.active
    ) THEN
        RAISE EXCEPTION 'esta operação é só para quem administra o app (RF19)'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT u.id, u.email, u.display_name, u.is_demo, u.is_admin,
               u.active, u.created_at
          FROM public.app_users u
         ORDER BY u.is_demo, u.email;
END
$$;

COMMENT ON FUNCTION admin_list_app_users() IS
    'Lista a allowlist inteira para quem administra (RF19). SECURITY DEFINER '
    'porque a policy de app_users deixa ver só a própria linha; a permissão é '
    'checada por dentro da função, não pela tela.';

-- SECURITY DEFINER exige fechar o acesso: por padrão o PostgreSQL concede
-- EXECUTE a PUBLIC, e aqui isso significaria dar a lista a qualquer papel.
REVOKE ALL ON FUNCTION admin_list_app_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_app_users() TO app;
