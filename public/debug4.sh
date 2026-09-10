#!/bin/bash
echo "Testing FreeRADIUS locally on the VPS..."
docker exec emmatech-freeradius radtest QS5L45 QS5L45 127.0.0.1 0 testing123
echo "Checking recent logs..."
docker logs --tail 30 emmatech-freeradius
