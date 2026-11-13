-- Migration 014 — leitura de extrato pela IA (pedido do Pedro, 2026-11-07).
--
-- O extrato deixa de depender só da regra e do histórico: a IA lê o texto (já
-- mascarado) e propõe as movimentações, inclusive as de cofrinho. Cada leitura
-- fica registrada em ai_calls como as outras.

ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_uso;
ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_uso
    CHECK (use_case IN ('chat', 'notificacao', 'categoria', 'extrato'));
