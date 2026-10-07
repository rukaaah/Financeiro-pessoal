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
| [002](002-hospedagem-community-cloud.md) | Hospedagem no Streamlit Community Cloud + GitHub Actions | Aceito |
| [003](003-login-google-app-users.md) | Login Google via `st.login` com allowlist em `app_users` | Aceito |
| [004](004-neon-psycopg-rls.md) | Neon + psycopg 3 + RLS por `SET LOCAL` | Aceito |
| [005](005-orcamento-pelo-mes-da-fatura.md) | Despesa de cartão entra no orçamento do mês de vencimento da fatura | Aceito |
