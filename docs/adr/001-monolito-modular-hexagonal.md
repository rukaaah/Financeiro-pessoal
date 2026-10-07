# ADR-001 — Monólito modular com arquitetura hexagonal por módulo

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O sistema substitui uma planilha de orçamento pessoal de um único usuário. O domínio
é pequeno em volume de dados, mas não em regras: lançamentos de três tipos,
transferências de soma zero, faturas de cartão com fechamento e vencimento, cofrinhos
com finalidade de resgate, valores a receber por pessoa, importação de extratos e
classificação automática.

É um projeto de portfólio em repositório público, mantido por uma pessoa, com
restrição de custo zero. Precisa parecer — e ser — bem construído, sem o peso
operacional de microsserviços. Ao mesmo tempo, um monólito sem fronteiras explícitas
degrada rápido: a UI começa a montar SQL, o parser de extrato passa a conhecer a
tabela de orçamento, e o acoplamento vira irreversível.

## Decisão

Um único deployable (o app Streamlit), organizado como **monólito modular**, com
**arquitetura hexagonal dentro de cada módulo**.

Módulos em `src/financeiro/`: `ledger`, `budgeting`, `cards`, `goals`, `investments`,
`market_data`, `importing`, `categorization`, `identity`, `shared`.

Três camadas por módulo:

- `domain` — regras de negócio puras. Só stdlib. Sem psycopg, sem Streamlit, sem I/O.
- `application` — casos de uso, e os *ports* de que eles precisam, declarados como
  `typing.Protocol`.
- `adapters` — implementações dos ports: repositórios psycopg, parsers de extrato,
  scrapers de cotação.

Regras de fronteira:

1. `app/`, `jobs/` e `scripts/` só chamam casos de uso da camada `application`.
   Nunca tocam `domain`, `adapters` ou o banco diretamente.
2. Nenhum módulo lê tabela de outro módulo. A comunicação entre módulos é por caso
   de uso.
3. As dependências entre camadas apontam só para dentro: `adapters` → `application`
   → `domain`.

As três regras são verificadas mecanicamente por **import-linter** no CI
(`[tool.importlinter]` no `pyproject.toml`). Fronteira que não é testada não é
fronteira.

## Consequências

**A favor:**

- Testar o `domain` é trivial e rápido: não há banco para subir. Isso viabiliza TDD
  de verdade nas regras que mais importam (soma zero, `invoice_month`, finalidade do
  resgate).
- Os ports como `Protocol` permitem *fakes* em memória na camada `application`, então
  a maior parte da suíte roda sem Docker.
- Trocar PicPay-PDF por outro parser, ou psycopg por outra coisa, é mexer num adapter.
- Se um módulo um dia precisar virar serviço, a costura já existe.

**Contra:**

- Mais arquivos e mais indireção do que o volume de dados exigiria. Para um CRUD puro
  isso seria exagero; aqui se paga pelas regras de negócio.
- Mapear entre objetos de domínio e linhas do Postgres é trabalho manual e repetitivo
  (não há ORM).
- Exige disciplina para não criar um `shared` que vira depósito de tudo.

## Alternativas consideradas

- **Scripts Streamlit com SQL inline.** Mais rápido para o MVP e honesto para uma
  planilha. Recusado: as regras de fatura e de transferência ficariam espalhadas pelas
  páginas, sem como testá-las isoladamente, e o projeto é vitrine de arquitetura.
- **Django + ORM.** Traz admin, migrations e autenticação prontos. Recusado: a camada
  de UI é Streamlit, o modelo ativo do ORM puxa regra de negócio para dentro do modelo
  de persistência, e boa parte dos invariantes vai morar em constraints e triggers do
  Postgres (ADR-004), onde o ORM atrapalha mais do que ajuda.
- **Hexagonal global** (um `domain/`, um `adapters/` para o sistema inteiro).
  Recusado: sem fronteira de módulo, `cards` e `budgeting` acabariam compartilhando
  entidades e o acoplamento voltaria por dentro do `domain`.
