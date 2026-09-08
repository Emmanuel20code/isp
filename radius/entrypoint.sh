#!/bin/sh
set -e

echo "======================================================"
echo " Starting EMMATECH FreeRADIUS Server"
echo " Multi-Tenant PPPoE & Hotspot Billing Integration"
echo "======================================================"

RADDB="/etc/freeradius/3.0"
[ -d "/etc/raddb" ] && RADDB="/etc/raddb"

# 1. Parse DATABASE_URL if provided
if [ -n "$DATABASE_URL" ]; then
    echo "[Entrypoint] Parsing DATABASE_URL..."
    # Format: postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
    PROTO="$(echo "$DATABASE_URL" | grep :// | sed -e's,^\(.*://\).*,\1,g')"
    URL_NO_PROTO="$(echo "${DATABASE_URL/$PROTO/}")"
    
    # Extract user:password
    USER_PASS="$(echo "$URL_NO_PROTO" | grep @ | cut -d@ -f1)"
    HOST_PORT_DB="$(echo "$URL_NO_PROTO" | sed -e "s,^$USER_PASS@,,")"
    
    if [ -n "$USER_PASS" ]; then
        PGUSER="$(echo "$USER_PASS" | cut -d: -f1)"
        PGPASSWORD="$(echo "$USER_PASS" | cut -d: -f2-)"
    fi
    
    # Extract host, port, db
    HOST_PORT="$(echo "$HOST_PORT_DB" | cut -d/ -f1)"
    PGDATABASE="$(echo "$HOST_PORT_DB" | cut -d/ -f2- | cut -d? -f1)"
    
    PGHOST="$(echo "$HOST_PORT" | cut -d: -f1)"
    PGPORT="$(echo "$HOST_PORT" | grep : | cut -d: -f2)"
fi

# Fallbacks
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
RADIUS_SECRET="${RADIUS_SECRET:-emmatech_radius_secret_2026}"

echo "[Entrypoint] Target PostgreSQL: $PGHOST:$PGPORT / Database: $PGDATABASE"

# Wait for PostgreSQL to be ready
echo "[Entrypoint] Waiting for PostgreSQL at $PGHOST:$PGPORT to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until nc -z -w 2 "$PGHOST" "$PGPORT" 2>/dev/null || [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "[Entrypoint] PostgreSQL not yet ready. Retrying ($RETRY_COUNT/$MAX_RETRIES)..."
    sleep 2
done

echo "[Entrypoint] Ensuring FreeRADIUS database schema in PostgreSQL..."
PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" << "EOSQL" || echo "[Entrypoint] Schema check/init finished"
CREATE TABLE IF NOT EXISTS radcheck (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op VARCHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radcheck_username_idx ON radcheck(username);

CREATE TABLE IF NOT EXISTS radreply (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op VARCHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radreply_username_idx ON radreply(username);

CREATE TABLE IF NOT EXISTS radgroupcheck (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op VARCHAR(2) NOT NULL DEFAULT '==',
    value VARCHAR(253) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS radgroupreply (
    id SERIAL PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    attribute VARCHAR(64) NOT NULL DEFAULT '',
    op VARCHAR(2) NOT NULL DEFAULT '=',
    value VARCHAR(253) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS radusergroup (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT '',
    groupname VARCHAR(64) NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS radpostauth (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT '',
    pass VARCHAR(64) NOT NULL DEFAULT '',
    reply VARCHAR(32) NOT NULL DEFAULT '',
    authdate TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    nasipaddress VARCHAR(45) NOT NULL DEFAULT '',
    callingstationid VARCHAR(50) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGSERIAL PRIMARY KEY,
    acctsessionid VARCHAR(64) NOT NULL DEFAULT '',
    acctuniqueid VARCHAR(32) NOT NULL DEFAULT '',
    username VARCHAR(64) NOT NULL DEFAULT '',
    realm VARCHAR(64) DEFAULT '',
    nasipaddress INET NOT NULL DEFAULT '127.0.0.1'::inet,
    nasportid VARCHAR(32) DEFAULT NULL,
    nasporttype VARCHAR(32) DEFAULT NULL,
    acctstarttime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    acctupdatetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    acctstoptime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    acctinterval INTEGER DEFAULT NULL,
    acctsessiontime INTEGER DEFAULT NULL,
    acctauthentic VARCHAR(32) DEFAULT NULL,
    connectinfo_start VARCHAR(50) DEFAULT NULL,
    connectinfo_stop VARCHAR(50) DEFAULT NULL,
    acctinputoctets BIGINT DEFAULT 0,
    acctoutputoctets BIGINT DEFAULT 0,
    calledstationid VARCHAR(50) NOT NULL DEFAULT '',
    callingstationid VARCHAR(50) NOT NULL DEFAULT '',
    acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
    servicetype VARCHAR(32) DEFAULT NULL,
    framedprotocol VARCHAR(32) DEFAULT NULL,
    framedipaddress INET DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS radacct_username_idx ON radacct(username);
CREATE INDEX IF NOT EXISTS radacct_session_idx ON radacct(acctsessionid);

CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    secret VARCHAR(60) NOT NULL,
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200) DEFAULT 'RADIUS Client'
);
EOSQL

# 2. Substitute credentials into sql module config
if [ -f "$RADDB/mods-available/sql" ]; then
    sed -i "s|@@PGHOST@@|$PGHOST|g" "$RADDB/mods-available/sql"
    sed -i "s|@@PGPORT@@|$PGPORT|g" "$RADDB/mods-available/sql"
    sed -i "s|@@PGUSER@@|$PGUSER|g" "$RADDB/mods-available/sql"
    sed -i "s|@@PGPASSWORD@@|$PGPASSWORD|g" "$RADDB/mods-available/sql"
    sed -i "s|@@PGDATABASE@@|$PGDATABASE|g" "$RADDB/mods-available/sql"
fi

# 3. Substitute shared secret into clients.conf
if [ -f "$RADDB/clients.conf" ]; then
    sed -i "s|@@RADIUS_SECRET@@|$RADIUS_SECRET|g" "$RADDB/clients.conf"
fi

# 4. Enable SQL module and standard modules
mkdir -p "$RADDB/mods-enabled" "$RADDB/sites-enabled"
for mod in sql pap chap mschap preprocess acct_unique detail digest expiration logintime always; do
    if [ -f "$RADDB/mods-available/$mod" ]; then
        ln -sf "$RADDB/mods-available/$mod" "$RADDB/mods-enabled/$mod"
    fi
done

ln -sf "$RADDB/sites-available/default" "$RADDB/sites-enabled/default"

# Remove conflicting default modules if present
rm -f "$RADDB/sites-enabled/inner-tunnel" 2>/dev/null || true

# 5. Fix permissions
chown -R freerad:freerad "$RADDB" /var/log/freeradius /var/run/freeradius 2>/dev/null || true

echo "[Entrypoint] Configuration complete. Launching FreeRADIUS..."

if [ "$DEBUG" = "true" ] || [ "$DEBUG" = "1" ]; then
    exec freeradius -X
else
    exec freeradius -f -l stdout
fi
