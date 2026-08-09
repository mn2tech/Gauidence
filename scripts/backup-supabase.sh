#!/usr/bin/env bash
# Daily Supabase PostgreSQL backup for Guardian.
# Requires: pg_dump, gzip
# Env: SUPABASE_DB_URL (postgresql://... connection URI from Supabase dashboard)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Error: SUPABASE_DB_URL is not set." >&2
  echo "Get it from Supabase Dashboard -> Project Settings -> Database -> Connection string (URI)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump not found. Install PostgreSQL client tools." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +"%Y-%m-%d-%H%M%S")"
OUT_FILE="$BACKUP_DIR/guardian-${STAMP}.sql.gz"

echo "Backing up to $OUT_FILE ..."
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip -9 > "$OUT_FILE"

BYTES=$(wc -c < "$OUT_FILE" | tr -d ' ')
echo "Done. Size: ${BYTES} bytes"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name "guardian-*.sql.gz" -type f -mtime "+$RETENTION_DAYS" -delete
  echo "Pruned backups older than ${RETENTION_DAYS} days."
fi
