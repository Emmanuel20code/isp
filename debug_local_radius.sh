# Build local radius container
docker build -t test-radius ./radius

docker run --rm -d --name test-radius \
  -e DATABASE_URL="postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -e RADIUS_SECRET="testing123" \
  -p 18120:1812/udp \
  test-radius

sleep 5

docker logs test-radius

