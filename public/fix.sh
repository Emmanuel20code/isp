#!/bin/bash
echo "Fixing EmmaTech FreeRADIUS config..."
docker exec emmatech-freeradius sh -c "sed -i 's/^[[:space:]]*#[[:space:]]*-sql/\tsql/g' /etc/freeradius/3.0/sites-available/default && sed -i 's/^[[:space:]]*-sql/\tsql/g' /etc/freeradius/3.0/sites-available/default && killall freeradius"
echo "Done! The radius server is restarting with the SQL module enabled."
