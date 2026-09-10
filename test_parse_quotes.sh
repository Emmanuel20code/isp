DATABASE_URL='"postgresql://postgres:Jevish2026!@db.bzjvzfrlfplhmmobzhmw.supabase.co:5432/postgres"'

PROTO="$(echo "$DATABASE_URL" | grep :// | sed -e's,^\(.*://\).*,\1,g')"
URL_NO_PROTO="$(echo "${DATABASE_URL/$PROTO/}")"

USER_PASS="$(echo "$URL_NO_PROTO" | grep @ | cut -d@ -f1)"
HOST_PORT_DB="$(echo "$URL_NO_PROTO" | sed -e "s,^$USER_PASS@,,")"

if [ -n "$USER_PASS" ]; then
    URL_USER="$(echo "$USER_PASS" | cut -d: -f1)"
    URL_PASS="$(echo "$USER_PASS" | cut -d: -f2-)"
fi

HOST_PORT="$(echo "$HOST_PORT_DB" | cut -d/ -f1)"
URL_DB="$(echo "$HOST_PORT_DB" | cut -d/ -f2- | cut -d? -f1)"

URL_HOST="$(echo "$HOST_PORT" | cut -d: -f1)"
URL_PORT="$(echo "$HOST_PORT" | grep : | cut -d: -f2)"

echo "HOST: $URL_HOST"
echo "PORT: $URL_PORT"
echo "USER: $URL_USER"
echo "PASS: $URL_PASS"
echo "DB:   $URL_DB"

