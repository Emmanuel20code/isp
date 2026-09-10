#!/bin/bash
echo "=== FreeRADIUS Database Connection Logs ==="
docker logs emmatech-freeradius 2>&1 | grep -iE "sql|rlm_sql|database|db_|postgres" | tail -n 30
echo "==========================================="
