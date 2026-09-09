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

## Step 2: Run the Automated Setup Script

We have included an automated setup script in your project (`contabo-setup.sh`). Run it on your VPS:

```bash
# 1. Download or upload your project files to your VPS (e.g., in /opt/wifibilling)
cd /opt/wifibilling

# 2. Make the setup script executable and run it
chmod +x contabo-setup.sh
./contabo-setup.sh
```
This script will automatically:
- Install **Docker**, **Docker Compose**, and **Git**.
- Configure **UFW Firewall** to open:
  - `TCP 80` & `TCP 443` (Web Traffic)
  - `TCP 3000` (Direct Web App access)
  - `UDP 1812` (RADIUS Authentication)
  - `UDP 1813` (RADIUS Accounting)
  - `UDP 3799` (RADIUS CoA / Disconnect)

---

## Step 3: Configure Your Environment Variables

Create your production `.env` file from `.env.example`:

```bash
cp .env.example .env
nano .env
```

Fill in your production details:
```env
# Database (either your remote Supabase/PostgreSQL URL, or local docker postgres)
DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres

# Supabase keys (if using Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# App Public URL
APP_URL=http://YOUR_CONTABO_VPS_IP:3000

# RADIUS Secret
RADIUS_SECRET=emmatech_radius_secret_2026

# M-Pesa Daraja API Credentials
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=your_shortcode
```

---

## Step 4: Start Everything with Docker Compose

Run the production stack in detached mode:

```bash
# If using local PostgreSQL on the VPS along with web app and radius:
sudo docker compose --profile local-db up -d --build

# Or if using remote Supabase/Railway database:
sudo docker compose up -d --build
```

---

## Step 5: Verify Services Are Running

Check container health and logs:
```bash
sudo docker compose ps
sudo docker compose logs -f
```

---

## Step 6: Configure Your MikroTik Routers

In your MikroTik RouterOS terminal, point your routers directly to your Contabo VPS IP:

```mikrotik
/radius add address=YOUR_CONTABO_VPS_IP secret=emmatech_radius_secret_2026 service=ppp,hotspot
/radius incoming set enabled=yes
/ppp aaa set use-radius=yes
```

*(Replace `YOUR_CONTABO_VPS_IP` with your Contabo VPS public IP address).*
