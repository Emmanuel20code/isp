#!/bin/bash

# Ensure required environment variables are set
if [ -z "$RADIUS_DOMAIN" ] || [ -z "$ADMIN_EMAIL" ]; then
    echo "ERROR: RADIUS_DOMAIN and ADMIN_EMAIL environment variables must be set."
    exit 1
fi

echo "Starting entrypoint script..."

# 1. Obtain/Renew certificate
if [ ! -f /etc/letsencrypt/live/${RADIUS_DOMAIN}/fullchain.pem ]; then
    echo "Attempting to obtain certificate for ${RADIUS_DOMAIN}..."
    # Ensure directory exists for certbot
    mkdir -p /etc/letsencrypt
    
    certbot certonly --standalone \
      --non-interactive \
      --agree-tos \
      --email "${ADMIN_EMAIL}" \
      -d "${RADIUS_DOMAIN}" \
      --http-01-port 8080
      
    if [ $? -ne 0 ]; then
        echo "ERROR: Certbot failed to obtain certificate."
        exit 1
    fi
    echo "Certificate obtained successfully."
else
    echo "Certificate already exists."
fi

# Ensure radius user can read the certificates
chown -R freerad:freerad /etc/letsencrypt

# 2. Start FreeRADIUS in foreground
echo "Starting FreeRADIUS..."
if [ -x /usr/sbin/radiusd ]; then
    # -X for extensive debugging, remove once stable
    /usr/sbin/radiusd -f -X
else
    echo "ERROR: radiusd executable not found at /usr/sbin/radiusd"
    exit 1
fi
