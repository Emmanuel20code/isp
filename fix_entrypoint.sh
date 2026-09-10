sed -i 's|until timeout 2 bash -c "<dev/tcp/$PGHOST/$PGPORT" 2>/dev/null|until psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1" >/dev/null 2>\&1|' radius/entrypoint.sh
