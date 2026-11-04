-- Migration 011 — registro das chamadas à IA (docs/v3/04-ia.md).
--
-- Guarda que houve a chamada, de que uso, o tamanho da entrada e se a conferência
-- dos números aceitou a resposta. O texto enviado NÃO é guardado. Serve para a cota
-- diária e para medir o acerto.

CREATE TABLE ai_calls (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    use_case    text        NOT NULL,
    input_chars integer     NOT NULL,
    accepted    boolean     NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ai_calls_uso CHECK (use_case IN ('chat', 'notificacao', 'categoria'))
);

CREATE INDEX ai_calls_do_dia ON ai_calls (user_id, created_at);

ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_calls_isolamento ON ai_calls
    FOR ALL TO app USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
GRANT SELECT, INSERT ON ai_calls TO app;
