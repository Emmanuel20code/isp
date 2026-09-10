import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Updating radcheck op ---");
  await client.query(`UPDATE radcheck SET op = '==' WHERE attribute = 'Cleartext-Password';`);
  await client.query(`UPDATE radreply SET op = '='`);

  const sql = `
CREATE OR REPLACE FUNCTION sync_voucher_to_radius()
RETURNS TRIGGER AS $$
DECLARE
  v_rate_limit TEXT := '5M/10M';
  v_session_timeout INT := 3600;
  v_is_valid BOOLEAN := false;
  v_speed_up INT;
  v_speed_down INT;
  v_duration_hour NUMERIC;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM radcheck WHERE username = OLD.code;
    DELETE FROM radreply WHERE username = OLD.code;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.code <> NEW.code THEN
    DELETE FROM radcheck WHERE username = OLD.code;
    DELETE FROM radreply WHERE username = OLD.code;
  END IF;

  -- Fetch package specs
  IF NEW.package_id IS NOT NULL THEN
    SELECT speed_up_mbps, speed_down_mbps, duration_hours
    INTO v_speed_up, v_speed_down, v_duration_hour
    FROM packages
    WHERE id = NEW.package_id;
    
    IF v_speed_up IS NOT NULL AND v_speed_down IS NOT NULL THEN
      v_rate_limit := v_speed_up || 'M/' || v_speed_down || 'M';
    END IF;

    IF v_duration_hour IS NOT NULL AND v_duration_hour > 0 THEN
      v_session_timeout := (v_duration_hour * 3600)::INT;
    END IF;
  END IF;

  -- Check validity: unused or active and not expired
  v_is_valid := (NEW.status IN ('unused', 'active'))
                AND (NEW.expires_at IS NULL OR NEW.expires_at > NOW());

  DELETE FROM radcheck WHERE username = NEW.code;
  DELETE FROM radreply WHERE username = NEW.code;

  IF v_is_valid THEN
    -- Insert Cleartext-Password with op ==
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Cleartext-Password', '==', NEW.code, NEW.tenant_id, NEW.tenant_id);

    -- Insert radreply attributes
    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES 
      (NEW.code, 'Mikrotik-Rate-Limit', '=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
      (NEW.code, 'Port-Limit', '=', '1', NEW.tenant_id, NEW.tenant_id);

    IF NEW.expires_at IS NOT NULL THEN
      v_session_timeout := GREATEST(60, EXTRACT(EPOCH FROM (NEW.expires_at - NOW()))::INT);
    END IF;
    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Session-Timeout', '=', v_session_timeout::TEXT, NEW.tenant_id, NEW.tenant_id);
  ELSE
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Auth-Type', ':=', 'Reject', NEW.tenant_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_customer_to_radius()
RETURNS TRIGGER AS $$
DECLARE
  v_rate_limit TEXT := '5M/10M';
  v_session_timeout INT := 3600;
  v_is_valid BOOLEAN := false;
  v_speed_up INT;
  v_speed_down INT;
  v_tenant_active BOOLEAN := false;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.kind = 'pppoe' AND OLD.username IS NOT NULL THEN
      DELETE FROM radcheck WHERE username = OLD.username;
      DELETE FROM radreply WHERE username = OLD.username;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.kind <> 'pppoe' OR NEW.username IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL THEN
      DELETE FROM radcheck WHERE username = OLD.username;
      DELETE FROM radreply WHERE username = OLD.username;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL AND OLD.username <> NEW.username THEN
    DELETE FROM radcheck WHERE username = OLD.username;
    DELETE FROM radreply WHERE username = OLD.username;
  END IF;

  SELECT (t.is_active = true AND t.subscription_status IN ('trialing', 'active'))
  INTO v_tenant_active
  FROM tenants t
  WHERE t.id = NEW.tenant_id;

  IF v_tenant_active IS NULL THEN
    v_tenant_active := true;
  END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT speed_up_mbps, speed_down_mbps
    INTO v_speed_up, v_speed_down
    FROM packages
    WHERE id = NEW.package_id;
    
    IF v_speed_up IS NOT NULL AND v_speed_down IS NOT NULL THEN
      v_rate_limit := v_speed_up || 'M/' || v_speed_down || 'M';
    END IF;
  END IF;

  v_is_valid := (NEW.status = 'active') 
                AND (NEW.expires_at IS NULL OR NEW.expires_at > NOW())
                AND v_tenant_active;

  DELETE FROM radcheck WHERE username = NEW.username;
  DELETE FROM radreply WHERE username = NEW.username;

  IF v_is_valid THEN
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.username, 'Cleartext-Password', '==', COALESCE(NEW.password, NEW.username), NEW.tenant_id, NEW.tenant_id);

    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES 
      (NEW.username, 'Mikrotik-Rate-Limit', '=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Framed-Protocol', '=', 'PPP', NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Service-Type', '=', 'Framed-User', NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Port-Limit', '=', '1', NEW.tenant_id, NEW.tenant_id);

    IF NEW.expires_at IS NOT NULL THEN
      v_session_timeout := GREATEST(60, EXTRACT(EPOCH FROM (NEW.expires_at - NOW()))::INT);
      INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.username, 'Session-Timeout', '=', v_session_timeout::TEXT, NEW.tenant_id, NEW.tenant_id);
    END IF;
  ELSE
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.username, 'Auth-Type', ':=', 'Reject', NEW.tenant_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  `;

  try {
    await client.query(sql);
    console.log("Op updated successfully back to ==");
  } catch (err) {
    console.error("Trigger error:", err.message);
  }

  await client.end();
}
check();
