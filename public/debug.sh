#!/bin/bash
docker exec -it emmatech-freeradius killall freeradius
docker exec -it emmatech-freeradius freeradius -X
