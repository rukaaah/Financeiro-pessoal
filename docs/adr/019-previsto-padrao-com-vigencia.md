# ADR-019 — Previsto: padrão por categoria com vigência, ajuste do mês como exceção

- **Status:** Proposto (Portão 3 do replanejamento v3). Substitui, se aceito, o
  [ADR-013](013-modelo-recorrente-de-previsto.md), que estava pendente.
- **Data:** 2026-11-04

## Decisão (as quatro perguntas do ADR-013)

1. **Onde mora o padrão:** tabela própria `budget_templates (category_id, amount,
   valid_from)`, porque a vigência exige período.
2. **Como se combinam:** `budgets` guarda só a exceção do mês. O previsto de um mês é
   `coalesce(ajuste do mês, padrão vigente naquele mês)`, numa view.
3. **Vigência:** mudar o padrão de Mercado de R$ 700 para R$ 800 hoje **não** muda março.
   Mesmo princípio do `account_terms` (ADR-005).
4. **Receita:** mesmo mecanismo. A "renda base" é a soma dos padrões das categorias de
   receita; o que vier acima aparece como "acima do previsto".

## Consequências

Migration 007. A tela de Ajustes → Categorias e previsto edita o padrão (com "vale a
partir de"); o detalhe da categoria edita o ajuste do mês.
