#!/bin/bash
echo "Rebuilding FreeRADIUS container without the blocking DEFAULT rule..."
cd /opt/wifibilling

# Completely overwrite the users file to ensure the DEFAULT block is gone forever
cat << 'USERFILE' > radius/users
# -*- text -*-
#### users -- FreeRADIUS static user file
### Local testing user (allows checking RADIUS server health without database)
testuser Cleartext-Password := "testpass"
	Mikrotik-Rate-Limit = "10M/10M",
	Session-Timeout = 86400,
	Reply-Message = "Welcome to EMMATECH Multi-Tenant Billing Service!"
USERFILE

# Rebuild and restart the container
docker compose build radius
docker compose up -d radius

echo "Done! FreeRADIUS is now completely clean and checking SQL directly."
