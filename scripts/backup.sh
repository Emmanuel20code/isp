#!/bin/bash
# ==============================================================================
# EMMATECH Wi-Fi Billing System - Automated Daily Production Backup Script
# ==============================================================================
# This script performs a full backup of the PostgreSQL database, application 
# configuration (.env files), and FreeRADIUS configurations, compresses them into
# a secure tar.gz archive, and rotates old backups.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Configurations
BACKUP_DIR="/var/backups/wifibilling"
RETENTION_DAYS=30
DATE_STR=$(date +%Y-%m-%d_%H-%M-%S)
POSTGRES_CONTAINER="emmatech-postgres"
BACKUP_NAME="emmatech_wifibilling_backup_${DATE_STR}"
TEMP_DIR="/tmp/${BACKUP_NAME}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"
mkdir -p "$TEMP_DIR"

echo "======================================================"
echo "Starting Emmatech production backup at $(date)"
echo "======================================================"

# 1. Backing up database via Docker pg_dump
echo "[1/4] Dumping PostgreSQL database..."
if docker ps | grep -q "$POSTGRES_CONTAINER"; then
    docker exec -t "$POSTGRES_CONTAINER" pg_dumpall -U postgres > "${TEMP_DIR}/database_dump.sql"
    echo "✓ Database successfully dumped."
else
    echo "⚠️ Warning: PostgreSQL container '$POSTGRES_CONTAINER' is not running."
    echo "Attempting to dump using system-wide pg_dump if available..."
    if command -v pg_dumpall &> /dev/null; then
        pg_dumpall -U postgres > "${TEMP_DIR}/database_dump.sql"
        echo "✓ Local database successfully dumped."
    elif [ -n "$DATABASE_URL" ]; then
        pg_dump "$DATABASE_URL" > "${TEMP_DIR}/database_dump.sql"
        echo "✓ Database URL successfully dumped."
    else
        echo "❌ Error: No running database container or utility found to dump database."
        exit 1
    fi
fi

# 2. Backing up system configuration and scripts
echo "[2/4] Backing up configuration files and scripts..."
mkdir -p "${TEMP_DIR}/config"

# Copy compose and env files from installation
for file in docker-compose.yml .env .env.example package.json metadata.json; do
    if [ -f "/opt/wifibilling/${file}" ]; then
        cp "/opt/wifibilling/${file}" "${TEMP_DIR}/config/"
    elif [ -f "./${file}" ]; then
        cp "./${file}" "${TEMP_DIR}/config/"
    fi
done

# 3. Backing up FreeRADIUS configuration files
echo "[3/4] Backing up FreeRADIUS configurations..."
if [ -d "/opt/wifibilling/radius" ]; then
    cp -r "/opt/wifibilling/radius" "${TEMP_DIR}/freeradius"
elif [ -d "./radius" ]; then
    cp -r "./radius" "${TEMP_DIR}/freeradius"
fi

# 4. Compressing and securing backup package
echo "[4/4] Archiving, compressing and securing the backup..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "/tmp" "$BACKUP_NAME"

# Restrict permissions to root-only for security (contains secrets)
chmod 600 "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Clean up temp folder
rm -rf "$TEMP_DIR"

echo "======================================================"
echo "✓ Backup completed successfully!"
echo "Backup Location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "Backup Size: $(du -sh "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)"
echo "======================================================"

# 5. Rotate old backups
echo "Performing rotation. Deleting backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "emmatech_wifibilling_backup_*.tar.gz" -mtime +"$RETENTION_DAYS" -exec rm -v {} \;
echo "✓ Rotation completed."
echo "======================================================"
