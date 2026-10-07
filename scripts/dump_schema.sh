#!/usr/bin/env bash
# Escreve docs/schema.sql a partir do Postgres de desenvolvimento.
#
# Funciona em dois ambientes, sem exigir postgresql-client instalado em nenhum:
#
#   - na máquina de desenvolvimento, usa o pg_dump de dentro do container do
#     docker-compose;
#   - no CI, onde o Postgres é um service container e não há compose, roda a
#     mesma imagem como cliente na rede do host.
#
# Usar sempre a imagem postgres:18-alpine nos dois casos evita a divergência
# clássica de um pg_dump mais antigo que o servidor.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGEM_PG="postgres:18-alpine"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-owner}"
PGPASSWORD="${PGPASSWORD:-dev}"
PGDATABASE="${PGDATABASE:-financeiro}"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker não encontrado: ele é necessário para gerar o schema." >&2
    exit 1
fi

executa_pg_dump() {
    if [ -n "$(docker compose ps --status running --quiet db 2>/dev/null)" ]; then
        docker compose exec -T db pg_dump --username "$PGUSER" --dbname "$PGDATABASE" "$@"
    else
        docker run --rm --network host -e PGPASSWORD="$PGPASSWORD" "$IMAGEM_PG" \
            pg_dump \
            --host "$PGHOST" --port "$PGPORT" \
            --username "$PGUSER" --dbname "$PGDATABASE" "$@"
    fi
}

{
    echo "-- Gerado por scripts/dump_schema.sh. Não edite à mão."
    echo "-- Reflete as migrations aplicadas no Postgres local."
    echo
    # Sem --no-privileges de propósito: os GRANTs fazem parte do modelo de
    # segurança (ADR-004) e devem aparecer junto das policies.
    # O yoyo cria _yoyo_log, _yoyo_migration, _yoyo_version e yoyo_lock.
    executa_pg_dump \
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
