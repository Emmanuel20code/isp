#!/bin/bash
docker logs emmatech-freeradius | grep -i "sql" | tail -n 20
