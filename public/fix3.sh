#!/bin/bash
echo "Fixing EMMATECH FreeRADIUS users file..."

# Use a safer sed command or just overwrite the file entirely except for testuser
docker exec emmatech-freeradius sh -c "sed -i '/DEFAULT Auth-Type/d' /etc/freeradius/3.0/users"
docker exec emmatech-freeradius sh -c "sed -i '/EMMATECH: Authentication Failed/d' /etc/freeradius/3.0/users"
docker exec emmatech-freeradius sh -c "sed -i '/Fallback profile/d' /etc/freeradius/3.0/users"

# Restart FreeRADIUS
docker restart emmatech-freeradius

echo "Done! The RADIUS server has been restarted without the blocking DEFAULT rule."
