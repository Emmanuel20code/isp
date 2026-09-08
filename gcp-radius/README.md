# Google Cloud RADIUS Server for WiFi Billing (Railway Connected)

This package contains your standalone Node.js FreeRADIUS server configured to run on a **Google Cloud Compute Engine** Virtual Machine (VM) while connecting directly to your existing PostgreSQL database hosted on **Railway** (or Supabase).

---

## Why Google Cloud + Railway?
- **Railway** handles your web dashboard, M-Pesa payments, and router API sync over TCP/HTTPS.
- **Google Cloud** handles public inbound **UDP ports 1812 (Auth) and 1813 (Acct)** for your MikroTik routers, which PaaS platforms like Railway do not support.
- **Shared Database**: Both connect to the exact same PostgreSQL database, meaning when you add a customer or receive an M-Pesa payment on Railway, RADIUS authenticates them instantly on Google Cloud!

---

## Step-by-Step Deployment Guide on Google Cloud

### Step 1: Create a Google Cloud Compute Engine VM
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **Compute Engine > VM instances > Create Instance**.
3. Choose a region close to your ISP subscribers (e.g., `europe-west3` or `africa-south1`).
4. Select **e2-micro** or **e2-small** (Free tier eligible in many regions).
5. Operating System: **Ubuntu 22.04 LTS**.
6. Firewall: Check **Allow HTTP traffic** and **Allow HTTPS traffic**.
7. Click **Create**.

### Step 2: Configure GCP Firewall Rules for RADIUS (UDP 1812 & 1813)
1. In Google Cloud Console, go to **VPC network > Firewall rules > Create Firewall Rule**.
2. Name: `allow-radius`
3. Targets: **All instances in the network**
4. Source filter: **IPv4 ranges** -> `0.0.0.0/0`
5. Protocols and ports: Check **Specified protocols and ports** -> `udp:1812,1813`.
6. Click **Create**.

### Step 3: Assign a Static External IP Address
1. Go to **VPC network > External IP addresses**.
2. Find your VM instance, and change its IP type from **Ephemeral** to **Static**.
3. Note down this **Static Public IP Address** (e.g., `34.123.45.67`). This is the IP address your MikroTik routers will use in RADIUS settings!

### Step 4: Deploy the RADIUS Server
1. SSH into your Google Cloud VM via the Google Console browser SSH button.
2. Clone or copy the `/gcp-radius` files to your VM (or create them via nano).
3. Make the deploy script executable and run it:
   ```bash
   chmod +x deploy-gcp.sh
   ./deploy-gcp.sh
   ```
4. Update your Railway PostgreSQL connection string in the systemd service:
   ```bash
   sudo nano /etc/systemd/system/wifibilling-radius.service
   ```
   Replace `YOUR_RAILWAY_DATABASE_URL_HERE` with your actual Railway `DATABASE_URL`.
5. Reload and restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart wifibilling-radius
   ```
6. Check service logs:
   ```bash
   sudo journalctl -u wifibilling-radius -f
   ```

### Step 5: Configure Your MikroTik Routers
In your MikroTik RouterOS terminal, run:
```mikrotik
/radius add address=YOUR_GCP_STATIC_IP secret=emmatech_radius_secret_2026 service=ppp,hotspot
/radius incoming set enabled=yes
/ppp aaa set use-radius=yes
```
*(Replace `YOUR_GCP_STATIC_IP` with your Google Cloud VM's static IP address).*
