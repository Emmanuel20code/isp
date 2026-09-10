#!/bin/bash
DATABASE_URL="postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres"

PROTO="$(echo "$DATABASE_URL" | grep :// | sed -e's,^\(.*://\).*,\1,g')"
URL_NO_PROTO="$(echo "${DATABASE_URL/$PROTO/}")"

# Extract user:password
USER_PASS="$(echo "$URL_NO_PROTO" | grep @ | cut -d@ -f1)"
HOST_PORT_DB="$(echo "$URL_NO_PROTO" | sed -e "s,^$USER_PASS@,,")"

if [ -n "$USER_PASS" ]; then
    URL_USER="$(echo "$USER_PASS" | cut -d: -f1)"
    URL_PASS="$(echo "$USER_PASS" | cut -d: -f2-)"
fi

# Extract host, port, db
HOST_PORT="$(echo "$HOST_PORT_DB" | cut -d/ -f1)"
URL_DB="$(echo "$HOST_PORT_DB" | cut -d/ -f2- | cut -d? -f1)"

URL_HOST="$(echo "$HOST_PORT" | cut -d: -f1)"
URL_PORT="$(echo "$HOST_PORT" | grep : | cut -d: -f2)"

echo "Host: $URL_HOST"
echo "Port: $URL_PORT"
echo "User: $URL_USER"
echo "Pass: $URL_PASS"
echo "DB: $URL_DB"
