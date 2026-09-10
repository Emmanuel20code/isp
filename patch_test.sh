cat << 'EOS' > entrypoint.sh
ln -sf "$RADDB/sites-available/default" "$RADDB/sites-enabled/default"
# Remove conflicting default modules if present
EOS
sed -i '/ln -sf.*sites-enabled\/default/a \
\
# UNCOMMENT SQL IN VIRTUAL SERVER \
sed -i "s/^[[:space:]]*#[[:space:]]*-sql/\tsql/g" "$RADDB/sites-available/default" \
sed -i "s/^[[:space:]]*-sql/\tsql/g" "$RADDB/sites-available/default"' entrypoint.sh
cat entrypoint.sh
