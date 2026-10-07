# Financeiro pessoal

Sistema de finanças pessoais que substitui uma planilha de orçamento: lançamentos,
orçamento mensal, faturas de cartão, cofrinhos, valores a receber e carteira de
investimentos.

Projeto de portfólio, em desenvolvimento. **Fase 0 concluída** — repositório,
banco com RLS, CI, identidade e esqueleto do app. A Fase 1 começa pelos casos de
uso de lançamentos e orçamento.

## Como funciona

O app é público, os dados não. Quem acessa sem estar na allowlist cai no **modo
demo**, com dados fictícios e uma faixa avisando disso. O isolamento entre usuários
é imposto pelo Postgres, via Row Level Security — não por filtros na aplicação.

## Stack

| Peça | Escolha |
|---|---|
| Interface | Streamlit (multipage com `st.navigation`) |
| Hospedagem | Streamlit Community Cloud |
| Banco | Postgres no Neon |
| Acesso ao banco | `psycopg` 3, SQL à mão, transações explícitas |
| Login | Google via `st.login` (OIDC) + allowlist em `app_users` |
| Migrations | yoyo-migrations, SQL puro |
| Jobs | GitHub Actions agendado |
| Ferramentas | uv, Python 3.12, ruff, mypy, pytest, pre-commit, import-linter |

As decisões e seus porquês estão em [`docs/adr/`](docs/adr/). Os passos de
publicação, em [`docs/deploy.md`](docs/deploy.md), e as medições que dependem do
app no ar, em [`docs/validacoes.md`](docs/validacoes.md).

## Arquitetura

Monólito modular com arquitetura hexagonal por módulo ([ADR-001](docs/adr/001-monolito-modular-hexagonal.md)).

```
src/financeiro/
├── ledger/          lançamentos: receita, despesa, transferência
├── budgeting/       orçamento mensal por categoria
├── cards/           faturas de cartão, fechamento e vencimento
├── goals/           cofrinhos e objetivos
├── investments/     carteira
├── market_data/     cotações e proventos
├── importing/       extratos (PDF do PicPay, OFX do Inter)
├── categorization/  classificação automática de lançamentos
├── identity/        login, allowlist, unit of work
└── shared/          tipos e utilidades comuns
```

A interface fica em `app/`, com uma página por arquivo em `app/paginas/` e o
ponto de entrada em `streamlit_app.py`.

Cada módulo tem três camadas, com as dependências apontando só para dentro:

```
adapters  →  application  →  domain
(psycopg,    (casos de uso    (regras puras,
 parsers,     e ports como     só stdlib)
 scrapers)    Protocol)
```

Três regras, verificadas por import-linter no CI:

1. `app/`, `jobs/` e `scripts/` só chamam casos de uso.
2. Nenhum módulo lê tabela de outro módulo.
3. O `domain` não conhece banco nem framework.

## Desenvolvimento

Requer [uv](https://docs.astral.sh/uv/) e Docker.

```bash
uv sync                    # cria o .venv com Python 3.12 e instala tudo
uv run pre-commit install  # liga os hooks de commit
cp .env.example .env.local # DATABASE_URL do Postgres local
docker compose up -d       # sobe o Postgres 17 na porta 5433
```

Durante o trabalho:

```bash
uv run ruff format .       # formata
uv run ruff check . --fix  # lint
uv run mypy                # tipos (strict)
uv run lint-imports        # fronteiras da arquitetura
uv run pytest              # testes
```

Migrations ([ADR-006](docs/adr/006-runner-de-migrations.md)), sempre com o papel
`owner` e com a URL vinda do ambiente:

```bash
export DATABASE_URL="postgresql+psycopg://owner:dev@localhost:5433/financeiro"
uv run yoyo apply --database "$DATABASE_URL"   # aplica as pendentes
uv run yoyo list  --database "$DATABASE_URL"   # o que já está aplicado
./scripts/dump_schema.sh                        # regenera docs/schema.sql
```

Testes de integração precisam do Postgres local e são marcados com `integration`:

```bash
uv run pytest -m integration
```

Rodar o app:

```bash
uv run streamlit run streamlit_app.py
```

`DATABASE_URL` no ambiente tem precedência sobre os secrets do Streamlit, de
propósito: o `.streamlit/secrets.toml` da máquina aponta para produção, e sem
essa ordem um `streamlit run` local conectaria lá sem avisar.

Dados fictícios do modo demo:

```bash
uv run python scripts/seed_demo.py   # apaga e recria o usuário demo
```

É idempotente: rodar duas vezes dá o mesmo resultado. Em produção, um workflow
agendado faz isso toda noite, para que o que um visitante mexeu não fique para
o próximo.

## Segurança

O repositório é **público**. Portanto:

- `.env.local`, `.streamlit/secrets.toml` e qualquer URL de conexão ficam fora do
  Git — e fora de logs, prints e mensagens de commit.
- Extratos reais (`*.pdf`, `*.ofx`) nunca entram no repositório. Os testes usam
  apenas fixtures sintéticas em `tests/fixtures/`.
- Hooks de pre-commit barram os dois casos antes do commit.
- Valores monetários são `Decimal` no Python e `numeric(14,2)` no banco. Nunca
  `float`.

## Convenções

- GitHub Flow: branches curtas a partir de `main`, PR com CI verde.
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
  `chore:`, `docs:`, `test:`.
- TDD no `domain`; fakes dos ports na `application`; integração contra Postgres em
  Docker.
- Texto voltado ao usuário em português do Brasil.
