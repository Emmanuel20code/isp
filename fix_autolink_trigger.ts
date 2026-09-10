import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  const sql = `
CREATE OR REPLACE FUNCTION trg_autolink_radius_event()
RETURNS TRIGGER AS $$
DECLARE
  v_cust RECORD;
  v_rtr RECORD;
  v_tenant_id UUID;
BEGIN
  BEGIN
    IF NEW.tenant_id IS NULL THEN
      -- 1. Match from customers table
      IF NEW.username IS NOT NULL AND NEW.username != '' THEN
        SELECT id, tenant_id, router_id INTO v_cust
        FROM customers
        WHERE username = NEW.username
        LIMIT 1;
        
        IF v_cust.id IS NOT NULL THEN
          NEW.customer_id := v_cust.id;
          NEW.tenant_id := v_cust.tenant_id;
          IF NEW.router_id IS NULL THEN
            NEW.router_id := v_cust.router_id;
          END IF;
        END IF;
      END IF;

      -- 2. If still unlinked, match from vouchers table (Hotspot users)
      IF NEW.tenant_id IS NULL AND NEW.username IS NOT NULL AND NEW.username != '' THEN
        SELECT tenant_id, router_id INTO v_cust
        FROM vouchers
        WHERE code = NEW.username
        LIMIT 1;
        
        IF v_cust.tenant_id IS NOT NULL THEN
          NEW.tenant_id := v_cust.tenant_id;
          IF NEW.router_id IS NULL THEN
            NEW.router_id := v_cust.router_id;
          END IF;
        END IF;
      END IF;

      -- 3. If still unlinked, match from router NAS IP address
      IF NEW.tenant_id IS NULL AND NEW.nasipaddress IS NOT NULL THEN
        SELECT id, tenant_id INTO v_rtr
        FROM routers
        WHERE public_ip = host(NEW.nasipaddress::inet) OR public_ip = NEW.nasipaddress::text
        LIMIT 1;
        
        IF v_rtr.id IS NOT NULL THEN
          NEW.router_id := v_rtr.id;
          NEW.tenant_id := v_rtr.tenant_id;
        END IF;
      END IF;

      -- 4. Fallback if single tenant system
      IF NEW.tenant_id IS NULL THEN
        SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
        IF v_tenant_id IS NOT NULL THEN
          NEW.tenant_id := v_tenant_id;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore any errors in autolinking so we don't block the INSERT
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  `;

  try {
    await client.query(sql);
    console.log("Trigger applied successfully!");
  } catch (err) {
    console.error("Trigger error:", err.message);
  }

  await client.end();
}
check();
