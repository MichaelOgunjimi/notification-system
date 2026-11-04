#!/usr/bin/env bash
# Dumps the production Postgres database and prunes backups older than
# RETENTION_DAYS. Intended to run on the VM via cron, e.g.:
#   0 3 * * * cd /path/to/notification-system && infra/backup.sh >> infra/backups/backup.log 2>&1
set -euo pipefail
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")/.."

RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="infra/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/notification_system_${TIMESTAMP}.sql.gz"

mkdir -p -m 700 "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

COMPOSE="docker compose -f infra/compose.prod.yml --env-file env/.env.production"

$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-notification_system}" \
  | gzip > "$OUT_FILE"

echo "Backup written to ${OUT_FILE}"

find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
