echo "authorize {" > default
echo "    # -sql" >> default
echo "    -sql" >> default
echo "}" >> default
sed -i 's/^[[:space:]]*#[[:space:]]*-sql/sql/g' default
sed -i 's/^[[:space:]]*-sql/sql/g' default
cat default
