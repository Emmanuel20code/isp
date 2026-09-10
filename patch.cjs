const fs = require('fs');
let content = fs.readFileSync('radius/entrypoint.sh', 'utf-8');
if (!content.includes('FORCE ENABLE SQL')) {
  content = content.replace(
    'echo "[Entrypoint] Configuration complete. Launching FreeRADIUS..."',
    `# !!! THIS IS THE FIX !!! FORCE ENABLE SQL IN ALL BLOCKS
sed -i "s/^[[:space:]]*#[[:space:]]*-sql/\\tsql/g" "$RADDB/sites-available/default"
sed -i "s/^[[:space:]]*-sql/\\tsql/g" "$RADDB/sites-available/default"

echo "[Entrypoint] Configuration complete. Launching FreeRADIUS..."`
  );
  fs.writeFileSync('radius/entrypoint.sh', content);
  console.log("Patched successfully!");
}
