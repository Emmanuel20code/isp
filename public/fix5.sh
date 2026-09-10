#!/bin/bash
docker exec emmatech-freeradius sh -c "sed -i '/DEFAULT Auth-Type := Reject/d' /etc/freeradius/3.0/users"
docker exec emmatech-freeradius sh -c "sed -i '/EMMATECH: Authentication Failed/d' /etc/freeradius/3.0/users"
docker restart emmatech-freeradius
