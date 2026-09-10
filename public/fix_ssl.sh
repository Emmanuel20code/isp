#!/bin/bash
cd /opt/wifibilling

# We need to tell the rlm_sql_postgresql driver to use SSL.
# The driver doesn't automatically inherit the PGSSLMODE environment variable.
# We must explicitly add 'tls { require = yes }' to the sql module config.

sed -i 's/radius_db = "$PGDATABASE"/radius_db = "$PGDATABASE"\n\ttls {\n\t\trequire = yes\n\t}/g' radius/entrypoint.sh

docker compose build radius
docker compose up -d radius

echo "Done! FreeRADIUS will now connect to Supabase with SSL required."
