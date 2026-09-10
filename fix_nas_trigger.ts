import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  const sql = `
CREATE OR REPLACE FUNCTION sync_router_to_nas()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO nas (
      id, nasname, shortname, type, secret, "tenantId", tenant_id, router_id, description, "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      COALESCE(NEW.public_ip, '0.0.0.0/0'),
      NEW.name,
      'mikrotik',
      COALESCE(NEW.radius_secret, 'emmatech_radius_secret_2026'),
      NEW.tenant_id,
      NEW.tenant_id,
      NEW.id,
      'Auto-synced router ' || NEW.name,
      NOW(),
      NOW()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE nas SET 
      nasname = COALESCE(NEW.public_ip, '0.0.0.0/0'),
      shortname = NEW.name,
      secret = COALESCE(NEW.radius_secret, 'emmatech_radius_secret_2026'),
      "updatedAt" = NOW()
    WHERE router_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM nas WHERE router_id = OLD.id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_router_to_nas ON routers;
CREATE TRIGGER trg_sync_router_to_nas
AFTER INSERT OR UPDATE OR DELETE ON routers
FOR EACH ROW EXECUTE FUNCTION sync_router_to_nas();
  `;

  try {
    await client.query(sql);
    console.log("Router to NAS trigger applied successfully!");
  } catch (err) {
    console.error("Trigger error:", err.message);
  }

  await client.end();
}
check();
