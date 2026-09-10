#!/bin/bash
echo "Finding project directory..."
cd /opt/wifibilling 2>/dev/null || cd /root/wifibilling 2>/dev/null || cd /root/Wifi-Billing 2>/dev/null || cd /root 

echo "Patching entrypoint to force SQL module..."
sed -i 's/^[[:space:]]*#[[:space:]]*-sql/\tsql/g' radius/entrypoint.sh 2>/dev/null
sed -i 's/^[[:space:]]*-sql/\tsql/g' radius/entrypoint.sh 2>/dev/null

# Just to be absolutely sure, let's append it if not present
if ! grep -q "FORCE ENABLE SQL" radius/entrypoint.sh; then
  sed -i '/ln -sf.*sites-enabled\/default/a \
\
# !!! THIS IS THE FIX !!! FORCE ENABLE SQL IN ALL BLOCKS \
sed -i "s/^[[:space:]]*#[[:space:]]*-sql/\\tsql/g" "$RADDB/sites-available/default" \
sed -i "s/^[[:space:]]*-sql/\\tsql/g" "$RADDB/sites-available/default"' radius/entrypoint.sh
fi

echo "Rebuilding and restarting FreeRADIUS..."
docker compose stop radius 2>/dev/null || docker stop emmatech-freeradius 2>/dev/null
docker rm -f emmatech-freeradius 2>/dev/null
docker compose build radius
docker compose up -d radius

echo "Done! Waiting 5 seconds for it to start..."
sleep 5
docker logs emmatech-freeradius --tail 20
