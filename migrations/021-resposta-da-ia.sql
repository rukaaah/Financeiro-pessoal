-- Migration 021 — guarda o texto que a IA devolveu em cada chamada do chat.
--
-- Auditoria de imparcialidade: sem o texto, não dá para revisar depois o que a IA disse
-- sobre um fundo nem por que uma resposta foi descartada. Linha do próprio usuário (RLS
-- de ai_calls), cortada em 4000 caracteres pelo Worker. Null nas chamadas antigas e nos
-- usos que não são chat.
-- (020 fica reservada para o histórico do fundo, na branch carteira-selic-copom.)

ALTER TABLE ai_calls ADD COLUMN response text;
