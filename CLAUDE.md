# Financeiro-pessoal — contexto para o Claude Code

Sistema de finanças pessoais que substitui a planilha "Orçamento Pessoal". Projeto de portfólio: **repositório público**.
Planejamento completo (fonte da verdade): artifact privado no Claude — o link fica fora do repo, que é público.

## Regras inegociáveis

- **Nunca** ler em voz alta, imprimir, logar ou commitar `.env.local`, `.streamlit/secrets.toml` ou qualquer URL de conexão. O repo é público.
- **Nunca** commitar extratos reais (`*.pdf`, `*.ofx`). Testes usam só fixtures sintéticas em `tests/fixtures/`.
- Antes de todo commit: `git status` e conferir que nenhum segredo aparece.
- Valores monetários em `Decimal` / `numeric(14,2)`, nunca `float`.
- Custo zero: nenhuma API ou serviço pago.

## Stack (decidida)

| Peça | Escolha |
|---|---|
| Interface | Streamlit (multipage com `st.navigation`) |
| Hospedagem | Streamlit Community Cloud (app público; dados protegidos por login + RLS) |
| Banco | Postgres no Neon (projeto "Financeiro pessoal"; branch `production`; criar `dev` sem TTL) |
| Acesso ao banco | `psycopg` 3 direto, transações reais (unit of work) |
| Login | Google via `st.login` (OIDC). E-mail verificado presente em `app_users` → app real; qualquer outro → modo demo |
| Jobs | GitHub Actions agendado: cotações (diário), proventos FII (mensal), reset do demo (noturno) |
| Ferramentas | uv, Python 3.12, ruff, mypy, pytest, pre-commit, import-linter |

`uv sync` **não** instala grupo nenhum por omissão (`default-groups = []`): o Community Cloud roda `uv sync` a cada boot e não deve carregar ferramentas de desenvolvimento. Use `uv sync --group dev` localmente e no CI. O `streamlit` é pedido como `streamlit[auth]`, porque o extra traz a Authlib que o `st.login` exige.
| Testes de banco | Postgres em Docker (`docker-compose.yml` local; service container no CI) |

Atenção: `neon.ts` foi gerado pelo `neon config init` com `ttl: "7d"` para branches novos. Remover o TTL antes de criar o branch `dev`.

## Arquitetura

Monolito modular + hexagonal por módulo (ADR-001).

- Módulos em `src/financeiro/`: `ledger`, `budgeting`, `cards`, `goals`, `investments`, `market_data`, `importing`, `categorization`, `identity`, `shared`.
- Camadas por módulo: `domain` (puro, só stdlib) → `application` (casos de uso + ports com `typing.Protocol`) → `adapters` (psycopg, parsers, scrapers).
- UI (`app/`), `jobs/` e `scripts/` só chamam casos de uso. Nenhum módulo lê tabela de outro. Fronteiras checadas por import-linter no CI.
- No Postgres: invariantes (transferência soma zero, `invoice_month`, unicidade, FKs), RLS e views de agregação.
- No Python: orquestração, operações de várias linhas numa transação, parsing, scraping, classificador.

### RLS e conexão

- Papéis: `owner` (só migrations), `app` (sem BYPASSRLS, usado pelo Streamlit), `jobs` (só tabelas dos jobs).
- Policies: `user_id = current_setting('app.user_id')::uuid`.
- O app faz `SET LOCAL app.user_id = <id>` em **cada** transação. O pool pode ser compartilhado (`st.cache_resource`); o usuário vem de `st.session_state`, nunca de variável global.

## Regras de negócio essenciais

- Tipos de lançamento: receita, despesa, transferência (duas pernas, soma zero). Aporte, reserva e pagamento de fatura são transferências.
- Cartão é aba à parte, como na planilha: a compra vive na fatura, e o dinheiro só aparece no débito quando a fatura é paga. O usuário cadastra em `account_terms` os **dois números que o app do banco mostra**: `closing_day` (fechamento, **inclusivo** — gasto nesse dia ainda entra na fatura que fecha nele) e `due_day` (vencimento, de 7 a 10 dias depois). Unicred: 4 e 11. Nubank: 27 e 5 — quando o vencimento é menor que o fechamento, a fatura vence no mês seguinte. A despesa entra no orçamento do **mês de vencimento da fatura**; cada parcela entra na fatura em que cai; pagamento de fatura não tem `invoice_month` (ADR-007, ADR-008). Editável com vigência em `account_terms`.
- Cofrinhos = contas `goal`. Aporte conta como guardado no mês. Resgate tem finalidade: usado no objetivo, empréstimo (fica "a devolver") ou retirada definitiva. Aporte só abate dívida quando marcado como devolução (RF18).
- Valores a receber = contas `receivable` por pessoa (`counterparties`). Pagar por alguém é transferência, não gasto (RF17).
- Bancos: PicPay (extrato PDF, conta do dia a dia, MVP), Inter (OFX, só investimentos, Fase 2), Unicred (cartão, entrada manual). Nubank fora do escopo.

## Fase 0 — tarefas (um PR por tarefa, em ordem)

- [x] **T1** Base do repo: `pyproject.toml` (uv, 3.12), ruff, mypy, pytest, pre-commit, import-linter, README inicial, ADRs 001–005 em `docs/adr/` (monolito modular; hospedagem Community Cloud + GitHub Actions; login Google + `app_users`; Neon + psycopg + RLS por `SET LOCAL`; orçamento pelo mês da fatura). Decidir se `neon.ts`/`package.json` ficam no repo.
- [x] **T2** `docker-compose.yml` com Postgres; escolher runner de migrations (yoyo-migrations ou dbmate) e registrar no ADR-006; branch `dev` no Neon sem TTL.
- [x] **T3** Migration 001: papéis `owner`/`app`/`jobs`, `app_users` (id, email, display_name, is_demo, active), função `current_app_user()`, padrão de RLS.
- [x] **T4** Migration 002: accounts, account_terms, counterparties, category_groups, categories, transactions; RLS, FKs, trigger de transferência soma zero.
- [x] **T5** CI (GitHub Actions): lint, mypy, testes unitários e de integração com Postgres service; teste de isolamento entre 2 usuários em todas as tabelas.
- [x] **T6** Módulo `identity`: `st.login`, consulta a `app_users`, roteamento dono/demo, unit of work com `SET LOCAL`.
- [x] **T7** Demo: `scripts/seed_demo.py` (dados fictícios) + workflow noturno de reset.
- [x] **T8** Esqueleto do app: `st.navigation` com páginas vazias, faixa "Dados fictícios", deploy no Community Cloud, secrets de produção, redirect de produção no OAuth client.
- [x] **T9** Validações: tempo de acordar do Neon (~0,4s, medido), hibernação do app (aceita, ADR-009), conta fora da allowlist caindo no demo (automatizado).

## Estado: Fase 0 concluída e no ar

Verificado em 2026-10-07 consultando o Neon e o GitHub, não por memória:

- app publicado no Community Cloud, login Google funcionando
- migrations 001 a 004 aplicadas em `production`
- 1 usuário dono e 1 demo ativos; demo com 38 lançamentos
- papéis `app` e `jobs` sem `BYPASSRLS`
- workflow de reset do demo já executado com sucesso
- sem monitor externo, por decisão (ADR-009): o app dorme após 12h sem visita e
  acorda com um clique

Detalhes em `docs/deploy.md` (o que foi configurado) e `docs/validacoes.md` (o
que foi medido). A Fase 1 começa pelos casos de uso de lançamentos e orçamento.

## Convenções

- GitHub Flow: branches curtas a partir de `main`, PR com CI verde.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- TDD no `domain`; fakes dos ports na `application`; integração contra Postgres em Docker.
- Texto voltado ao usuário em português do Brasil.
