# ADR-006 — yoyo-migrations como runner de migrations

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O ADR-004 coloca boa parte do valor do sistema dentro do Postgres: papéis
(`owner`/`app`/`jobs`), RLS com policies por `user_id`, a função
`current_app_user()`, o trigger que força transferência a somar zero, constraints de
`invoice_month` e views de agregação. Isso tudo precisa ser versionado, aplicável de
forma repetível no Neon (`production` e `dev`) e no Postgres em Docker, e executado
no CI a cada PR.

Duas restrições moldam a escolha:

1. **PL/pgSQL com *dollar quoting*.** Quase toda migration relevante vai conter
   `CREATE FUNCTION ... AS $$ ... ; ... $$`. Um runner que fatie o arquivo
   ingenuamente no `;` corrompe essas funções.
2. **Custo zero e pouca toolchain.** O projeto já carrega Node a contragosto por
   causa da CLI do Neon (ADR-004). Uma terceira toolchain precisa se pagar.

As duas candidatas eram yoyo-migrations e dbmate.

## Decisão

**yoyo-migrations**, instalado como dependência de desenvolvimento pelo uv.

- Migrations em `migrations/`, SQL puro, nomeadas `NNN-descricao.sql` com o par
  `NNN-descricao.rollback.sql`.
- Conexão sempre pelo scheme **`postgresql+psycopg://`** (psycopg 3 — o mesmo driver
  da aplicação). O scheme `postgresql://` faria o yoyo procurar psycopg2, um segundo
  driver que o projeto não instala.
- `yoyo.ini` versionado contém apenas `sources`, `migration_table` e `batch_mode`.
  **A URL vem de `DATABASE_URL` no ambiente**, nunca do arquivo: o repositório é
  público.
- Migrations rodam com o papel `owner`, nunca com `app` ou `jobs`.
- O `schema.sql` consolidado é gerado por `scripts/dump_schema.sh`, que chama
  `pg_dump` **de dentro do container** do docker-compose.

### Como a escolha foi feita

As duas ferramentas foram testadas contra o caso real, uma migration com
`CREATE FUNCTION ... $$ ... $$` contendo `;` e `RAISE EXCEPTION`:

| | yoyo | dbmate |
|---|---|---|
| Preserva *dollar quoting* | sim | sim |
| Aplica e reverte | sim | sim |
| Instalação | `uv add --dev` | binário Go (brew ou curl) |
| Driver | psycopg 3, o mesmo do app | embutido |
| `schema.sql` automático | não | **só com `pg_dump` no host** |

A hipótese de que o yoyo quebraria funções PL/pgSQL ao fatiar no `;` **não se
confirmou**: a função foi criada íntegra e executou corretamente, inclusive o
`RAISE EXCEPTION`.

O desempate foi a instalação. O `schema.sql` automático era a principal vantagem do
dbmate, mas ele depende do `pg_dump` no host — e, sem ele, o dbmate simplesmente
**não gera o arquivo e não avisa**. Obter essa vantagem custaria instalar o binário
do dbmate *e* o `postgresql-client`, na máquina de desenvolvimento e no CI. O mesmo
resultado sai de um script de 20 linhas usando o `pg_dump` que já existe dentro do
container, sem nenhuma instalação.

## Consequências

**A favor:**

- Zero toolchain nova: `uv sync --group dev` já traz o runner, e o CI não ganha
  passo de instalação. (O grupo é explícito porque o `pyproject.toml` não instala
  nenhum por omissão — ver ADR-002 sobre o boot do Community Cloud.)
- Um único driver de Postgres no projeto, o mesmo que a aplicação usa.
- SQL puro nos arquivos, legível para quem for ler o repositório como portfólio.
- O yoyo aceita *steps* em Python se algum dia uma migration precisar de lógica
  (backfill de dados, por exemplo), sem troca de ferramenta.

**Contra e armadilhas conhecidas:**

- **O `.rollback.sql` precisa existir antes do primeiro `apply`.** O yoyo grava os
  passos de rollback na tabela `_yoyo_migration` no momento em que aplica. Criado
  depois, o arquivo é ignorado: `yoyo rollback` não reverte nada **e sai com código
  0**. Isso foi observado na prática durante a avaliação. Mitigação: os dois arquivos
  são escritos juntos, e a revisão de PR cobra o par.
- **O nome do arquivo é a identidade da migration.** Renomear uma migration já
  aplicada faz o yoyo tratá-la como nova. Mitigação: nome nunca muda depois do merge.
- Não há dump de schema embutido; depende do nosso script e, portanto, do Docker
  estar de pé.
- Projeto menos movimentado que o dbmate. O risco é baixo porque as migrations são
  SQL puro: migrar de runner é reescrever a tabela de controle, não os arquivos.
- `batch_mode = on` evita que o yoyo peça confirmação interativa — necessário no CI,
  mas significa que um `apply` local não pergunta nada antes de aplicar.

## Alternativas consideradas

- **dbmate.** Avaliado em detalhe acima. Boa ferramenta; recusada pelo custo de
  instalação desproporcional ao ganho neste projeto.
- **Alembic.** Padrão do mundo Python. Recusado: é construído em torno do SQLAlchemy
  e da autogeração a partir de modelos ORM, que o ADR-001 e o ADR-004 descartam. Sem
  ORM, sobra só o controle de versão, com bastante peso junto.
- **`.sql` numerados aplicados por script próprio.** Recusado: controle de quais
  migrations já rodaram, transação por migration e locking são exatamente o que um
  runner resolve; reimplementar isso é retrabalho com risco.
- **Migrations pela CLI/branching do Neon.** Recusado: prenderia o schema ao Neon,
  enquanto os testes de integração rodam contra Postgres em Docker (T5).
