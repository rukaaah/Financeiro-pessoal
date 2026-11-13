DELETE FROM ai_calls WHERE use_case = 'extrato';
ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_uso;
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_uso
    CHECK (use_case IN ('chat', 'notificacao', 'categoria'));
