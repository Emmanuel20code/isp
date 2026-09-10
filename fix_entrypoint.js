const fs = require('fs');
const content = `#!/bin/sh
echo "======================================================"
echo "Starting EmmaTech FreeRADIUS Server"
echo "Multi-Tenant PPPoE & Hotspot Billing Integration"
echo "======================================================"

RADDB="/etc/freeradius/3.0"
[ -d "/etc/raddb" ] && RADDB="/etc/raddb"

# 1. Parse DATABASE_URL if provided
if [ -n "$DATABASE_URL" ]; then
    echo "[Entrypoint] Parsing DATABASE_URL..."
    PROTO="$(echo "$DATABASE_URL" | grep :// | sed -e's,^\\(.*://\\).*,\\1,g')"
    URL_NO_PROTO="$(echo "\${DATABASE_URL/$PROTO/}")"
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
fi

PGHOST="\${PGHOST:-\${POSTGRES_HOST:-\${URL_HOST:-postgres}}}"
PGPORT="\${PGPORT:-\${POSTGRES_PORT:-\${URL_PORT:-5432}}}"
PGUSER="\${PGUSER:-\${POSTGRES_USER:-\${URL_USER:-postgres}}}"
PGPASSWORD="\${PGPASSWORD:-\${POSTGRES_PASSWORD:-\${URL_PASS:-postgres}}}"
PGDATABASE="\${PGDATABASE:-\${POSTGRES_DB:-\${URL_DB:-postgres}}}"
RADIUS_SECRET="\${RADIUS_SECRET:-emmatech_radius_secret_2026}"

echo "[Entrypoint] Target PostgreSQL: $PGHOST:$PGPORT / Database: $PGDATABASE"

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

# 2. Safely generate sql module config with exact credentials
cat << EOF > "$RADDB/mods-available/sql"
# -*- text -*-
#### sql module configuration for PostgreSQL
##
sql {
	driver = "rlm_sql_postgresql"
	dialect = "postgresql"

	# Connection parameters
	server = "$PGHOST"
	port = "$PGPORT"
	login = "$PGUSER"
	password = "$PGPASSWORD"
	radius_db = "$PGDATABASE"

	# Connection pool settings
	pool {
		start = 5
		min = 3
		max = 20
		spare = 3
		uses = 0
		retry_delay = 5
		lifetime = 3600
		idle_timeout = 60
	}

	# Table names
	authcheck_table = "radcheck"
	authreply_table = "radreply"
	groupcheck_table = "radgroupcheck"
	groupreply_table = "radgroupreply"
	usergroup_table = "radusergroup"
	acct_table1 = "radacct"
	postauth_table = "radpostauth"
	client_table = "nas"

	# Group Membership Processing
	read_groups = yes
	group_attribute = "SQL-Group"

	# Dynamic clients from database
	read_clients = yes
	client_query = "SELECT id, nasname, shortname, type, secret, server FROM nas"

	# Include PostgreSQL queries
	\\$INCLUDE $RADDB/queries.conf
}
