#!/bin/bash
# EMMATECH RADIUS MASTER SETUP SCRIPT
# Run this on your Contabo server as root

echo "--- 1. Opening Firewall Ports (UDP) ---"
sudo ufw allow 1812/udp
sudo ufw allow 1813/udp
sudo ufw allow 3799/udp
sudo ufw reload

echo "--- 2. Enabling FreeRADIUS SQL Module ---"
sudo ln -s /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql

echo "--- 3. Configuring Trusted Clients ---"
# This allows any MikroTik to connect if they have the secret 'Jevish2026!'
cat <<EOF | sudo tee -a /etc/freeradius/3.0/clients.conf

client mikrotik_routers {
    ipaddr = 0.0.0.0/0
    secret = emmatech_radius_secret_2026
    nas_type = other
    limit {
        max_connections = 2048
    }
}
EOF

echo "--- 4. Restarting Service ---"
sudo systemctl restart freeradius

echo "--- SETUP COMPLETE ---"
echo "To check if it is working, run: sudo freeradius -X"
