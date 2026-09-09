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

## Step 5: Configure Nginx Reverse Proxy & SSL (HTTPS)

To ensure your MikroTik routers can securely fetch onboarding scripts from `https://www.wifibilling.site` without 404 errors, configure Nginx as a reverse proxy on your Contabo VPS:

1. Create the Nginx configuration file:
   ```bash
   sudo nano /etc/nginx/sites-available/wifibilling
   ```

2. Paste the following configuration (replace `www.wifibilling.site` with your domain):
   ```nginx
   server {
       listen 80;
       server_name www.wifibilling.site wifibilling.site;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/wifibilling /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. Install Free SSL with Certbot (Let's Encrypt):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d www.wifibilling.site -d wifibilling.site
   ```

---

## Step 6: Verify Services Are Running

Check container health and logs:
```bash
sudo docker compose ps
sudo docker compose logs -f
```

---

## Step 6: Configure Your MikroTik Routers & Verify FreeRADIUS Communication

In your MikroTik RouterOS terminal, point your routers to your Contabo VPS IP to enable RADIUS authentication and accounting:

```mikrotik
/radius add address=YOUR_CONTABO_VPS_IP secret=emmatech_radius_secret_2026 service=ppp,hotspot
/radius incoming set enabled=yes
/ppp aaa set use-radius=yes
```
*(Replace `YOUR_CONTABO_VPS_IP` with your Contabo VPS public IP address, and make sure the secret matches `RADIUS_SECRET` in your `.env` file).*

### How to Check FreeRADIUS Communication

1. **Check if FreeRADIUS Container is Running:**
   ```bash
   sudo docker compose ps
   ```
   *(Ensure `emmatech-freeradius` shows status as `Up` and healthy).*

2. **Check FreeRADIUS Real-Time Logs (to watch router packets):**
   ```bash
   sudo docker compose logs -f radius
   ```
   *When a user attempts to log in via Hotspot or PPPoE, you will see real-time authentication requests (`Access-Request`) and accounting packets (`Accounting-Request`) appearing in these logs.*

3. **Verify Firewall UDP Ports on Contabo VPS:**
   Ensure UFW allows incoming RADIUS traffic:
   ```bash
   sudo ufw allow 1812/udp
   sudo ufw allow 1813/udp
   sudo ufw allow 3799/udp
   sudo ufw reload
   ```
