#!/bin/bash
# ==============================================================================
# Contabo VPS One-Click Deployment Script for WiFi Billing System & FreeRADIUS
# ==============================================================================

set -e

echo "========================================================="
echo "Starting Contabo VPS Setup for WiFi Billing & RADIUS"
echo "========================================================="

# 1. Update and install prerequisites
echo "1. Installing Docker, Docker Compose, Git, and UFW..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw apt-transport-https ca-certificates gnupg lsb-release

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --arch) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 2. Configure UFW Firewall
echo "2. Configuring Firewall (allowing HTTP/S, SSH, and RADIUS UDP 1812/1813)..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 1812/udp
sudo ufw allow 1813/udp
sudo ufw allow 3799/udp
sudo ufw --force enable

echo "========================================================="
echo "✓ Contabo VPS Prerequisites Installed Successfully!"
echo "========================================================="
echo ""
echo "NEXT STEPS:"
echo "1. Clone or upload your project code to /opt/wifibilling (or your working directory)."
echo "2. Copy .env.example to .env and fill in your database URL and M-Pesa keys:"
echo "   cp .env.example .env"
echo "   nano .env"
echo "3. Run docker-compose to start everything:"
echo "   sudo docker compose up -d --build"
echo "========================================================="
