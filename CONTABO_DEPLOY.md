# Manual HTTPS & SSL Setup on Contabo VPS

Since you are already logged into your Contabo VPS via SSH, follow these direct manual steps to enable secure **HTTPS** for your `.site` domain using Nginx and Let's Encrypt Certbot.

---

### Step 1: Install Nginx & Certbot

Run the following commands in your VPS terminal:
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

### Step 2: Create Nginx Reverse Proxy Configuration

1. Create a new Nginx configuration file for your domain:
   ```bash
   sudo nano /etc/nginx/sites-available/wifibilling
   ```

2. Paste the following configuration (replace `yourdomain.site` with your actual `.site` domain name):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.site;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   *(Save and exit nano by pressing `Ctrl+O`, `Enter`, then `Ctrl+X`).*

3. Enable the site, remove default configuration, test, and restart Nginx:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/wifibilling /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

### Step 3: Obtain Free SSL Certificate via Let's Encrypt

Run Certbot to automatically configure SSL for your `.site` domain:
```bash
sudo certbot --nginx -d yourdomain.site
```
*(Follow the prompts, enter your email, and select option **2 (Redirect)** to automatically redirect all HTTP traffic to HTTPS).*

---

### Step 4: Update Your `.env` File

1. Navigate to your app installation directory:
   ```bash
   cd /opt/wifibilling # (or wherever your docker-compose.yml is located)
   ```

2. Edit your `.env` file:
   ```bash
   nano .env
   ```

3. Ensure `APP_URL` uses `https://`:
   ```env
   APP_URL=https://yourdomain.site
   ```
   *(Save and exit).*

---

### Step 5: Restart Docker Containers

Restart your containers to apply the HTTPS base URL:
```bash
sudo docker compose down
sudo docker compose up -d --build
```

Your app is now live and fully secured at **`https://yourdomain.site`**, ready for MikroTik routers and M-Pesa webhooks!

