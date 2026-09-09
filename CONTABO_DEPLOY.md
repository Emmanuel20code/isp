# Hosting WiFi Billing System & FreeRADIUS on Contabo VPS

Hosting everything on your **Contabo VPS** is the ultimate, most cost-effective setup for an ISP. Because a VPS gives you a **dedicated public static IP address** and full root access, you can run your Web Billing Dashboard, PostgreSQL database, and FreeRADIUS server (UDP ports 1812 & 1813) all on the same machine without any port restrictions.

---

## Step 1: Connect to your Contabo VPS via SSH

Open your terminal (Mac/Linux) or PuTTY (Windows) and connect to your Contabo VPS:
```bash
ssh root@YOUR_CONTABO_VPS_IP
```
*(Replace `YOUR_CONTABO_VPS_IP` with your actual Contabo server IP address).*

---

## Step 2: Run the One-Click Complete Setup Script (Docker + Nginx + SSL / HTTPS)

We have updated the automated setup script (`contabo-setup.sh`) to automatically configure Docker, UFW firewall, Nginx reverse proxy, and **Let's Encrypt SSL (HTTPS)** in one go!

```bash
# 1. Navigate to your project directory on your VPS (e.g. /opt/wifibilling)
cd /opt/wifibilling

# 2. Run the automated setup script with sudo
sudo bash contabo-setup.sh
```

When prompted:
1. Enter your domain name (e.g., `billing.yourdomain.com` pointing to your Contabo VPS IP).
2. Enter your email address for Let's Encrypt SSL notifications.

The script will automatically:
- Install **Docker**, **Docker Compose**, **Nginx**, and **Certbot**.
- Configure **UFW Firewall** (`TCP 80`, `TCP 443`, `TCP 3000`, and `UDP 1812/1813/3799`).
- Set up **Nginx Reverse Proxy** to forward traffic to port `3000`.
- Obtain and install a free **Let's Encrypt SSL Certificate** with auto-redirect to **HTTPS**.
- Update your `.env` file with `APP_URL=https://yourdomain.com`.
- Build and start your Docker containers.

---

## Step 3: Verify Your Deployment

Check container status and logs:
```bash
sudo docker compose ps
sudo docker compose logs -f
```

Your billing system, M-Pesa webhooks, and MikroTik routers can now securely communicate over **`https://yourdomain.com`**!
