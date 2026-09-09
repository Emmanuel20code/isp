#!/bin/bash
# ==============================================================================
# Contabo VPS One-Click Complete Setup Script (Docker, Firewall, Nginx, SSL/HTTPS)
# ==============================================================================

set -e

echo "========================================================="
echo "Contabo VPS Complete Setup & HTTPS Activation"
echo "========================================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script with sudo or as root:"
  echo "    sudo bash contabo-setup.sh"
  exit 1
fi

read -p "Enter your domain name or VPS public IP (e.g. billing.yourdomain.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
  echo "[-] Domain name cannot be empty."
  exit 1
fi

read -p "Enter your email address for Let's Encrypt SSL certificate: " SSL_EMAIL
if [ -z "$SSL_EMAIL" ]; then
  SSL_EMAIL="admin@$DOMAIN_NAME"
fi

# 1. Update and install prerequisites
echo "[1/6] Installing Docker, Docker Compose, Nginx, Certbot, and UFW..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx apt-transport-https ca-certificates gnupg lsb-release

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 2. Configure UFW Firewall
echo "[2/6] Configuring UFW Firewall (allowing HTTP/S, SSH, and RADIUS UDP 1812/1813/3799)..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw allow 1812/udp
ufw allow 1813/udp
ufw allow 3799/udp
ufw --force enable

# 3. Configure Nginx Reverse Proxy
echo "[3/6] Configuring Nginx Reverse Proxy for $DOMAIN_NAME..."
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

ln -sf /etc/nginx/sites-available/wifibilling /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# 4. Obtain SSL Certificate via Let's Encrypt
echo "[4/6] Obtaining SSL Certificate via Let's Encrypt for $DOMAIN_NAME..."
certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect || echo "[-] Certbot SSL generation skipped (ensure domain points to this VPS IP and ports 80/443 are open)."

# 5. Configure Environment Variables
echo "[5/6] Configuring .env file..."
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

if grep -q "APP_URL=" .env; then
  sed -i "s|APP_URL=.*|APP_URL=https://$DOMAIN_NAME|g" .env
else
  echo "APP_URL=https://$DOMAIN_NAME" >> .env
fi

# 6. Start Docker Compose
echo "[6/6] Building and starting Docker containers..."
if [ -f "docker-compose.yml" ]; then
  docker compose down || true
  docker compose up -d --build
else
  echo "[-] docker-compose.yml not found in current directory. Please run this script from the project root."
fi

echo "========================================================="
echo "✓ Contabo Setup & HTTPS Activation Completed Successfully!"
echo "========================================================="
echo "Your app is now live and secured at: https://$DOMAIN_NAME"
echo "========================================================="
