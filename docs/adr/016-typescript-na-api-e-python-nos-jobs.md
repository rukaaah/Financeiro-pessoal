# ADR-016 — TypeScript na API e na interface; Python nos jobs, migrations e testes de banco

- **Status:** Aceito (Portão 3 do replanejamento v3, aprovado pelo Pedro em 2026-11-04)
- **Data:** 2026-11-04
- **Complementa:** [ADR-001](001-monolito-modular-hexagonal.md) (o monólito modular e a
  hexagonal por módulo continuam, agora em TypeScript) e o [ADR-012](012-decimal-e-a-borda-de-renderizacao.md).

## Contexto

O runtime do Workers é JavaScript. Hoje, de Python de domínio, só existe `identity`
(com `shared`, 459 linhas). As regras críticas estão no Postgres. Os jobs (cotações,
proventos, reset do demo) e as migrations são Python e funcionam.

## Decisão

- **API e interface em TypeScript**, com os mesmos módulos do ADR-001 (`ledger`,
  `budgeting`, `cards`, `goals`, `investments`, `market_data`, `importing`,
  `categorization`, `identity`, `ai`), cada um com `domain` puro, `application` e
  `adapters`. Fronteiras checadas no CI (dependency-cruiser no lugar do import-linter).
- **Dinheiro em centavos inteiros (`bigint`) no TypeScript**, lidos do `numeric(14,2)`
  como texto e convertidos sem passar por `number` de ponto flutuante. `number` só na
  borda de desenho (gráfico), como o ADR-012 já previa para o `float`.
- **Python continua** em `jobs/`, `scripts/`, nas migrations (yoyo) e nos testes de
  integração de banco (RLS, triggers, isolamento).
- Testes de domínio com Vitest, TDD no `domain` como antes.

## Consequências

Duas linguagens no repositório, com papéis separados e sem código compartilhado. O que
precisa ser igual nos dois lados (o mês da fatura, por exemplo) fica no Postgres, que
os dois consultam.

## Alternativas consideradas

Tudo em TypeScript, inclusive jobs (refazer o que funciona sem ganho); Python Workers
(não confirmados).
