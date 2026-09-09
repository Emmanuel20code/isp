FROM debian:bookworm-slim

LABEL maintainer="EMMATECH WiFi & PPPoE Billing System"
LABEL description="FreeRADIUS with PostgreSQL integration for MikroTik PPPoE & Hotspot"

# Install FreeRADIUS, PostgreSQL module, and diagnostic utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    freeradius \
    freeradius-postgresql \
    freeradius-utils \
    postgresql-client \
    netcat-openbsd \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Setup directory structure
WORKDIR /etc/freeradius/3.0

# Copy FreeRADIUS configuration files
COPY dictionary.mikrotik /etc/freeradius/3.0/dictionary.mikrotik
COPY clients.conf /etc/freeradius/3.0/clients.conf
COPY queries.conf /etc/freeradius/3.0/queries.conf
COPY mods-available/sql /etc/freeradius/3.0/mods-available/sql
COPY sites-available/default /etc/freeradius/3.0/sites-available/default
COPY radiusd.conf /etc/freeradius/3.0/radiusd.conf
COPY users /etc/freeradius/3.0/users

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create required directories and set permissions
RUN mkdir -p /var/log/freeradius /var/run/freeradius \
    && chown -R freerad:freerad /etc/freeradius/3.0 /var/log/freeradius /var/run/freeradius

# Standard RADIUS Ports
# 1812/udp: Authentication
# 1813/udp: Accounting
# 3799/udp: CoA / Packet of Disconnect (PoD)
EXPOSE 1812/udp 1813/udp 3799/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD nc -z -u 127.0.0.1 1812 || exit 1

ENTRYPOINT ["/entrypoint.sh"]
