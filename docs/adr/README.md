# Architecture Decision Records

Registro das decisões de arquitetura deste projeto, em ordem cronológica.

Cada ADR segue o formato: **Contexto** (o que forçou a decisão) → **Decisão** (o que
foi escolhido) → **Consequências** (o que isso custa e habilita) → **Alternativas
consideradas**.

Um ADR aceito não é editado: se a decisão mudar, escreve-se um novo ADR que
substitui o anterior, e o antigo passa a `Status: substituído pelo ADR-NNN`.

| ADR | Título | Status |
|---|---|---|
| [001](001-monolito-modular-hexagonal.md) | Monólito modular com hexagonal por módulo | Aceito |
| [002](002-hospedagem-community-cloud.md) | Hospedagem no Streamlit Community Cloud + GitHub Actions | Hospedagem do app substituída pelo [015](015-pwa-e-api-no-cloudflare-workers.md); jobs continuam |
| [003](003-login-google-app-users.md) | Login Google via `st.login` com allowlist em `app_users` | Mecanismo substituído pelo [017](017-login-google-no-worker.md); regra continua |
| [004](004-neon-psycopg-rls.md) | Neon + psycopg 3 + RLS por `SET LOCAL` | Aceito |
| [005](005-orcamento-pelo-mes-da-fatura.md) | Despesa de cartão entra no orçamento do mês de vencimento da fatura | Aceito |
| [006](006-runner-de-migrations.md) | yoyo-migrations como runner de migrations | Aceito |
| [007](007-ciclo-de-fatura-e-pagamento.md) | Ciclo da fatura pelo dia de início; pagamento não é compra | Parcialmente substituído pelo [008](008-fechamento-inclusivo.md) |
| [008](008-fechamento-inclusivo.md) | Dia de fechamento é o do app do banco, e é inclusivo | Aceito |
| [009](009-aceitar-a-hibernacao-do-app.md) | Aceitar a hibernação do app; sem monitor externo | Substituído pelo [015](015-pwa-e-api-no-cloudflare-workers.md) |
| [010](010-pagamento-aponta-a-fatura-que-quita.md) | A perna de pagamento aponta a fatura que quita | Aceito |
| [011](011-arquitetura-da-interface.md) | Sete destinos, mês global e intenção antes de contabilidade | Navegação substituída pelo [015](015-pwa-e-api-no-cloudflare-workers.md) e por `docs/v3/05` |
| [012](012-decimal-e-a-borda-de-renderizacao.md) | `Decimal` em toda conta; `float` só na borda de renderização | Aceito |
| [013](013-modelo-recorrente-de-previsto.md) | Modelo recorrente de previsto | Substituído pelo [019](019-previsto-padrao-com-vigencia.md) |
| [014](014-natureza-da-categoria-e-cofrinho.md) | Natureza da categoria e a categoria com cofrinho | Aceito |
| [015](015-pwa-e-api-no-cloudflare-workers.md) | PWA com API num Cloudflare Worker, no lugar do Streamlit | Aceito |
| [016](016-typescript-na-api-e-python-nos-jobs.md) | TypeScript na API e na interface; Python nos jobs e testes de banco | Aceito |
| [017](017-login-google-no-worker.md) | Login Google por OIDC no Worker, sessão em cookie assinado | Aceito |
| [018](018-ia-no-workers-ai.md) | IA no Cloudflare Workers AI, pelo binding do Worker | Aceito |
| [019](019-previsto-padrao-com-vigencia.md) | Previsto: padrão com vigência, ajuste do mês como exceção | Aceito |
| [020](020-cotacoes-por-fontes-oficiais.md) | Cotações e indicadores de FII por B3, CVM e brapi, sem scraping | Proposto |
