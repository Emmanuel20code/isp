#!/bin/bash
# ==============================================================================
# Contabo VPS Automated SSL & HTTPS Activation Script for WiFi Billing
# ==============================================================================

set -e

echo "========================================================="
echo "Contabo VPS SSL / HTTPS Activation via Let's Encrypt"
echo "========================================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script with sudo or as root:"
  echo "    sudo bash contabo-ssl-setup.sh"
  exit 1
fi

# Prompt for domain name
read -p "Enter your domain name (e.g., billing.yourdomain.com or your VPS IP/domain): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
  echo "[-] Domain name cannot be empty. Exiting."
  exit 1
fi

read -p "Enter your email address for Let's Encrypt SSL expiration warnings: " SSL_EMAIL

if [ -z "$SSL_EMAIL" ]; then
  SSL_EMAIL="admin@$DOMAIN_NAME"
fi

echo "[+] Installing Nginx and Certbot..."
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo "[+] Configuring Nginx reverse proxy for $DOMAIN_NAME..."
cat << EOF > /etc/nginx/sites-available/wifibilling
server {
    listen 80;
    server_name $DOMAIN_NAME;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/wifibilling /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "[+] Testing Nginx configuration..."
nginx -t

echo "[+] Restarting Nginx..."
systemctl restart nginx

echo "[+] Obtaining SSL Certificate from Let's Encrypt for $DOMAIN_NAME..."
certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect

echo "[+] Updating APP_URL in .env if present..."
if [ -f ".env" ]; then
  if grep -q "APP_URL=" .env; then
    sed -i "s|APP_URL=.*|APP_URL=https://$DOMAIN_NAME|g" .env
  else
    echo "APP_URL=https://$DOMAIN_NAME" >> .env
  fi
  echo "[+] .env updated with APP_URL=https://$DOMAIN_NAME"
fi

echo "========================================================="
echo "✓ HTTPS Activated Successfully for https://$DOMAIN_NAME!"
echo "========================================================="
echo "Your MikroTik routers and M-Pesa callbacks can now securely"
echo "connect over HTTPS!"
echo "========================================================="
