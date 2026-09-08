#!/bin/bash
# ==========================================
# Google Cloud Compute Engine Radius Installer
# ==========================================

echo "1. Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y curl git ufw

echo "2. Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "3. Setting up RADIUS directory in /opt/wifibilling-radius..."
sudo mkdir -p /opt/wifibilling-radius
sudo cp -r . /opt/wifibilling-radius/
cd /opt/wifibilling-radius

echo "4. Installing npm dependencies..."
npm install

echo "5. Opening UDP ports 1812 and 1813 in UFW firewall..."
sudo ufw allow 1812/udp
sudo ufw allow 1813/udp
sudo ufw reload

echo "6. Creating systemd service for persistent background running..."
sudo bash -c 'cat > /etc/systemd/system/wifibilling-radius.service <<EOF
[Unit]
Description=WiFi Billing Node.js RADIUS Server (Google Cloud)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wifibilling-radius
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=wifibilling-radius
Environment=NODE_ENV=production
Environment=DATABASE_URL=YOUR_RAILWAY_DATABASE_URL_HERE

[Install]
WantedBy=multi-user.target
EOF'

echo "7. Enabling and starting wifibilling-radius service..."
sudo systemctl daemon-reload
sudo systemctl enable wifibilling-radius
sudo systemctl start wifibilling-radius

echo "======================================================="
echo "🎉 GCP RADIUS SERVER INSTALLED & RUNNING!"
echo "======================================================="
echo "IMPORTANT: Don't forget to:"
echo "1. Edit /etc/systemd/system/wifibilling-radius.service to put your actual Railway DATABASE_URL"
echo "2. Run: sudo systemctl restart wifibilling-radius"
echo "3. Open UDP ports 1812 and 1813 in your Google Cloud VPC Firewall rules."
echo "======================================================="
