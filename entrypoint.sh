ln -sf "$RADDB/sites-available/default" "$RADDB/sites-enabled/default"

# UNCOMMENT SQL IN VIRTUAL SERVER 
sed -i "s/^[[:space:]]*#[[:space:]]*-sql/	sql/g" "$RADDB/sites-available/default" 
sed -i "s/^[[:space:]]*-sql/	sql/g" "$RADDB/sites-available/default"
# Remove conflicting default modules if present
