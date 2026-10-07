# Migrations

Runner: **yoyo-migrations** ([ADR-006](../docs/adr/006-runner-de-migrations.md)).
Sempre aplicadas com o papel `owner`.

## Convenção de nomes

```
NNN-descricao-curta.sql           # aplica
NNN-descricao-curta.rollback.sql  # reverte
```

`NNN` é sequencial e com zeros à esquerda (`001`, `002`, ...). O nome do arquivo
é a identidade da migration para o yoyo: **renomear um arquivo já aplicado faz o
yoyo achar que é uma migration nova.**

## A regra que não pode ser esquecida

**O `.rollback.sql` precisa existir antes do primeiro `apply`.** O yoyo grava os
passos de rollback na tabela `_yoyo_migration` no momento em que aplica. Se o
arquivo de rollback for criado depois, o `yoyo rollback` **não reverte nada e
sai com código 0** — falha silenciosa. Escreva os dois arquivos juntos.

## Comandos

A URL vem do ambiente; ela nunca entra no repositório.

```bash
export DATABASE_URL="postgresql+psycopg://owner:dev@localhost:5433/financeiro"

uv run yoyo apply --database "$DATABASE_URL"     # aplica as pendentes
uv run yoyo list --database "$DATABASE_URL"      # mostra o que está aplicado
uv run yoyo rollback --database "$DATABASE_URL"  # reverte a última
```

O scheme é `postgresql+psycopg://` (psycopg 3), não `postgresql://` — este
último faz o yoyo procurar psycopg2, que o projeto não instala.

## Dump do schema

Gera `docs/schema.sql` com o estado atual do banco local, útil para revisar
policies de RLS e constraints num arquivo só, sem `pg_dump` instalado no host:

```bash
./scripts/dump_schema.sh
```
