until PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" >/dev/null 2>&1 || [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; do
