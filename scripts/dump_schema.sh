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
    docker compose exec -T db pg_dump \
        --username owner \
        --dbname financeiro \
        --schema-only \
        --no-owner \
        --no-privileges \
        --exclude-table '_yoyo_*'
} > docs/schema.sql

echo "docs/schema.sql atualizado."
