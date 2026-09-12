FROM debian:bookworm-slim

# Install dependencies, FreeRADIUS, and Tailscale
RUN apt-get update && apt-get install -y \
    freeradius \
    freeradius-postgresql \
    freeradius-utils \
    curl \
    ca-certificates \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Copy configuration and entrypoint
COPY radiusd.conf /etc/freeradius/3.0/radiusd.conf
COPY sql.conf /etc/freeradius/3.0/mods-enabled/sql
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose RadSec port (for reference)
EXPOSE 2083

ENTRYPOINT ["/entrypoint.sh"]
