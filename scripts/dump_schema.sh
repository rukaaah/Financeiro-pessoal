#!/usr/bin/env bash
# Escreve docs/schema.sql a partir do Postgres local do docker-compose.
# Usa o pg_dump de dentro do container: nada precisa estar instalado no host.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "$(docker compose ps --status running --quiet db 2>/dev/null)" ]; then
    echo "O serviço 'db' não está rodando. Use: docker compose up -d" >&2
    exit 1
fi

mkdir -p docs
{
    echo "-- Gerado por scripts/dump_schema.sh. Não edite à mão."
    echo "-- Reflete as migrations aplicadas no Postgres local."
    echo
    # Sem --no-privileges de propósito: os GRANTs fazem parte do modelo de
    # segurança (ADR-004) e devem aparecer junto das policies.
    # O yoyo cria _yoyo_log, _yoyo_migration, _yoyo_version e yoyo_lock.
    docker compose exec -T db pg_dump \
        --username owner \
        --dbname financeiro \
        --schema-only \
        --no-owner \
        --exclude-table '_yoyo_*' \
        --exclude-table 'yoyo_*'
} > docs/schema.sql.tmp

# Duas limpezas para que o arquivo seja determinístico e versionável:
#
# 1. O pg_dump 18 emite `\restrict`/`\unrestrict` com um token aleatório a cada
#    execução. Sem removê-los, todo dump gera diff mesmo sem mudança de schema,
#    e o CI não consegue checar se o arquivo está atualizado.
# 2. As linhas em branco do fim, que o hook end-of-file-fixer removeria sozinho
#    a cada regeneração.
grep -vE '^\\(un)?restrict ' docs/schema.sql.tmp \
    | awk 'NF {ultima = NR} {linhas[NR] = $0} END {for (i = 1; i <= ultima; i++) print linhas[i]}' \
    > docs/schema.sql
rm -f docs/schema.sql.tmp

echo "docs/schema.sql atualizado."
