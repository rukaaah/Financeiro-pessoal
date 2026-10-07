# ADR-004 — Postgres no Neon, acesso por psycopg 3 e isolamento por RLS com `SET LOCAL`

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

Os dados são financeiros e moram num app de URL pública (ADR-002), onde convivem o
usuário real e o modo demo (ADR-003). Precisamos de:

- Postgres gerenciado a custo zero;
- garantia de que uma sessão jamais enxergue linha de outro usuário — e que essa
  garantia não dependa de todo `SELECT` lembrar de filtrar por `user_id`;
- transações reais: um lançamento de transferência são duas linhas que entram juntas
  ou não entram.

## Decisão

**Banco:** Postgres no **Neon**, projeto "Financeiro pessoal", branch `production`.
Um branch `dev` **sem TTL** para desenvolvimento e para o Docker local espelhar.

**Acesso:** `psycopg` 3 direto, com SQL escrito à mão. Sem ORM. Pool de conexões
compartilhado via `st.cache_resource`. *Unit of work* explícita: um caso de uso abre
uma transação, faz tudo dentro dela, e commita no fim.

**Papéis:**

| Papel | Para quê | Observação |
|---|---|---|
| `owner` | só migrations | não é usado pela aplicação |
| `app` | o Streamlit | **sem `BYPASSRLS`** |
| `jobs` | GitHub Actions | só as tabelas dos jobs |

**Isolamento:** RLS ligada em toda tabela com `user_id`, com policy

```sql
user_id = current_setting('app.user_id')::uuid
```

e o app executando **`SET LOCAL app.user_id = <id>` como primeiro comando de cada
transação**. `SET LOCAL` — não `SET` — porque o escopo precisa morrer no fim da
transação: a conexão volta para um pool compartilhado entre sessões de usuários
diferentes, e um valor vazado entre `checkout`s seria exatamente a falha que a RLS
existe para impedir.

**Divisão de responsabilidade:**

- **No Postgres:** invariantes que não podem ser violados por nenhum caminho —
  transferência somando zero (trigger), `invoice_month`, unicidades, FKs — mais a RLS
  e views de agregação.
- **No Python:** orquestração, operações de várias linhas numa transação, parsing de
  extrato, scraping, classificador.

**Dinheiro:** `numeric(14,2)` no banco, `Decimal` no Python. Nunca `float`, em lugar
nenhum.

**Ferramentas Neon no repositório:** `neon.ts` e `package.json` **ficam
versionados**, com o `ttl: "7d"` de branches novos removido — era o padrão do
`neon config init` e expiraria o branch `dev`. Mantê-los deixa a política de branches
como código; o custo é uma toolchain Node no repositório, usada só pela CLI do Neon e
fora do CI (`node_modules/` está no `.gitignore`).

## Consequências

**A favor:**

- O isolamento é imposto pelo banco. Um `SELECT` que esqueça o filtro retorna vazio,
  não retorna dado alheio. É a diferença entre uma garantia e uma convenção.
- Sem `BYPASSRLS` no papel `app`, um bug na aplicação não consegue contornar a policy.
- SQL à mão deixa visíveis as views de agregação e as constraints, que são boa parte
  do valor deste projeto.
- Branches do Neon dão um banco descartável por feature.
- O teste de isolamento entre dois usuários roda no CI contra Postgres em Docker (T5),
  tabela por tabela.

**Contra:**

- **Toda** transação precisa do `SET LOCAL`. Esquecer significa, na melhor hipótese,
  zero linhas; por isso o `SET LOCAL` é responsabilidade da unit of work (T6) e não
  de cada caso de uso — nenhum chamador tem como esquecer.
- Mapeamento linha ↔ objeto é manual e repetitivo.
- O Neon hiberna o compute no plano gratuito: há latência de *cold start* somada à do
  Community Cloud (medida na T9).
- O plano gratuito do Neon limita horas de compute e armazenamento; volume pessoal
  cabe folgado, mas o limite existe.
- Postgres em Docker não é idêntico ao Neon (que separa compute de storage). Os testes
  cobrem schema, constraints e RLS, não o comportamento de hibernação.

## Alternativas consideradas

- **SQLite num arquivo.** Zero infraestrutura. Recusado: o sistema de arquivos do
  Community Cloud é efêmero — os dados sumiriam a cada redeploy — e não há RLS.
- **Supabase.** Postgres gerenciado com RLS e auth no pacote. Recusado: o plano
  gratuito pausa o projeto por inatividade, e a autenticação já está resolvida pelo
  `st.login` (ADR-003).
- **SQLAlchemy / ORM.** Menos SQL repetido. Recusado: ADR-001 mantém o `domain` puro,
  os invariantes centrais vivem em constraints e triggers, e o ORM adicionaria uma
  camada de tradução sobre o que queremos mostrar explicitamente.
- **Filtrar por `user_id` só no Python.** Recusado: funciona até o primeiro `WHERE`
  esquecido, e o custo do erro é vazar dado financeiro real num app público.
- **Uma conexão por sessão de usuário, sem pool.** Dispensaria o `SET LOCAL`.
  Recusado: o Neon limita conexões simultâneas e o Streamlit recria sessões com
  frequência.
