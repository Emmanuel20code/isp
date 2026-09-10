-- Migration: FreeRADIUS & PPPoE Multi-Tenant Integration
-- Connects PostgreSQL, FreeRADIUS, MikroTik RouterOS, and PPPoE subscribers

-- 1. Routers Table: Ensure radius_secret is present
ALTER TABLE routers ADD COLUMN IF NOT EXISTS radius_secret VARCHAR(64);
UPDATE routers SET radius_secret = encode(gen_random_bytes(16), 'hex') WHERE radius_secret IS NULL;

-- 2. NAS (Network Access Server / MikroTik clients)
ALTER TABLE nas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE nas ADD COLUMN IF NOT EXISTS router_id UUID REFERENCES routers(id) ON DELETE CASCADE;

-- Sync existing routers into nas
INSERT INTO nas (nasname, shortname, type, secret, "tenantId", tenant_id, router_id, description)
SELECT 
  COALESCE(r.public_ip, '0.0.0.0/0'), 
  r.name, 
  'mikrotik', 
  COALESCE(r.radius_secret, 'emmatech_radius_secret_2026'), 
  r.tenant_id, 
  r.tenant_id, 
  r.id, 
  'Auto-synced router ' || r.name
FROM routers r
WHERE NOT EXISTS (SELECT 1 FROM nas n WHERE n.router_id = r.id);

-- 3. Accounting Table (radacct)
ALTER TABLE radacct ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE radacct ADD COLUMN IF NOT EXISTS router_id UUID REFERENCES routers(id) ON DELETE SET NULL;
ALTER TABLE radacct ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_tenant_id ON radacct(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radacct_acctsessionid ON radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstoptime ON radacct(acctstoptime);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime ON radacct(acctstarttime DESC);

-- 4. Post-Auth Log Table (radpostauth)
ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS router_id UUID REFERENCES routers(id) ON DELETE SET NULL;
ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS callingstationid VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_radpostauth_username ON radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_tenant_id ON radpostauth(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radpostauth_authdate ON radpostauth(authdate DESC);

-- 5. Check & Reply Tables
ALTER TABLE radcheck ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE radreply ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username);
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);

-- 6. Trigger to automatically synchronize PPPoE customers to radcheck and radreply
CREATE OR REPLACE FUNCTION sync_customer_to_radius()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_active BOOLEAN := false;
  v_rate_limit TEXT := '5M/10M';
  v_session_timeout INT := 86400;
  v_is_valid BOOLEAN := false;
  v_speed_up INT;
  v_speed_down INT;
BEGIN
  -- Only process PPPoE customers
  IF (TG_OP = 'DELETE') THEN
    IF OLD.kind = 'pppoe' AND OLD.username IS NOT NULL THEN
      DELETE FROM radcheck WHERE username = OLD.username;
      DELETE FROM radreply WHERE username = OLD.username;
    END IF;
    RETURN OLD;
  END IF;

  -- If not pppoe, cleanup any leftover radius records
  IF NEW.kind <> 'pppoe' OR NEW.username IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL THEN
      DELETE FROM radcheck WHERE username = OLD.username;
      DELETE FROM radreply WHERE username = OLD.username;
    END IF;
    RETURN NEW;
  END IF;

  -- Clean up previous username if changed
  IF TG_OP = 'UPDATE' AND OLD.username IS NOT NULL AND OLD.username <> NEW.username THEN
    DELETE FROM radcheck WHERE username = OLD.username;
    DELETE FROM radreply WHERE username = OLD.username;
  END IF;

  -- Check tenant status
  SELECT (t.is_active = true AND t.subscription_status IN ('trialing', 'active'))
  INTO v_tenant_active
  FROM tenants t
  WHERE t.id = NEW.tenant_id;

  IF v_tenant_active IS NULL THEN
    v_tenant_active := true;
  END IF;

  -- Fetch package rate limits
  IF NEW.package_id IS NOT NULL THEN
    SELECT speed_up_mbps, speed_down_mbps
    INTO v_speed_up, v_speed_down
    FROM packages
    WHERE id = NEW.package_id;
    
    IF v_speed_up IS NOT NULL AND v_speed_down IS NOT NULL THEN
      v_rate_limit := v_speed_up || 'M/' || v_speed_down || 'M';
    END IF;
  END IF;

  -- Check validity
  v_is_valid := (NEW.status = 'active') 
                AND (NEW.expires_at IS NULL OR NEW.expires_at > NOW())
                AND v_tenant_active;

  -- Update radcheck and radreply
  DELETE FROM radcheck WHERE username = NEW.username;
  DELETE FROM radreply WHERE username = NEW.username;

  IF v_is_valid THEN
    -- Insert Cleartext-Password
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.username, 'Cleartext-Password', ':=', COALESCE(NEW.password, NEW.username), NEW.tenant_id, NEW.tenant_id);

    -- Insert radreply attributes
    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES 
      (NEW.username, 'Mikrotik-Rate-Limit', ':=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Framed-Protocol', ':=', 'PPP', NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Service-Type', ':=', 'Framed-User', NEW.tenant_id, NEW.tenant_id),
      (NEW.username, 'Port-Limit', ':=', '1', NEW.tenant_id, NEW.tenant_id);

    IF NEW.expires_at IS NOT NULL THEN
      v_session_timeout := GREATEST(60, EXTRACT(EPOCH FROM (NEW.expires_at - NOW()))::INT);
      INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.username, 'Session-Timeout', ':=', v_session_timeout::TEXT, NEW.tenant_id, NEW.tenant_id);
    END IF;
  ELSE
    -- Insert Auth-Type := Reject
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.username, 'Auth-Type', ':=', 'Reject', NEW.tenant_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_customer_to_radius ON customers;
CREATE TRIGGER trg_sync_customer_to_radius
AFTER INSERT OR UPDATE OR DELETE ON customers
FOR EACH ROW EXECUTE FUNCTION sync_customer_to_radius();

-- 6.1 Trigger to automatically synchronize Hotspot vouchers to radcheck and radreply
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
    -- Insert Cleartext-Password (code is username & password for Hotspot voucher)
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Cleartext-Password', ':=', NEW.code, NEW.tenant_id, NEW.tenant_id);

    -- Insert radreply attributes
    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES 
      (NEW.code, 'Mikrotik-Rate-Limit', ':=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
      (NEW.code, 'Port-Limit', ':=', '1', NEW.tenant_id, NEW.tenant_id);

    IF NEW.expires_at IS NOT NULL THEN
      v_session_timeout := GREATEST(60, EXTRACT(EPOCH FROM (NEW.expires_at - NOW()))::INT);
    END IF;

    INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Session-Timeout', ':=', v_session_timeout::TEXT, NEW.tenant_id, NEW.tenant_id);
  ELSE
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Auth-Type', ':=', 'Reject', NEW.tenant_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_voucher_to_radius ON vouchers;
CREATE TRIGGER trg_sync_voucher_to_radius
AFTER INSERT OR UPDATE OR DELETE ON vouchers
FOR EACH ROW EXECUTE FUNCTION sync_voucher_to_radius();

-- 7. Trigger to automatically synchronize Routers to NAS
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

-- 8. Trigger for accounting and post-auth auto-linkage
CREATE OR REPLACE FUNCTION trg_autolink_radius_event()
RETURNS TRIGGER AS $$
DECLARE
  v_cust RECORD;
  v_rtr RECORD;
  v_tenant_id UUID;
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
        NEW."tenantId" := v_cust.tenant_id;
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
        NEW."tenantId" := v_cust.tenant_id;
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
        NEW."tenantId" := v_rtr.tenant_id;
      END IF;
    END IF;

    -- 4. Fallback if single tenant system
    IF NEW.tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN
        NEW.tenant_id := v_tenant_id;
        NEW."tenantId" := v_tenant_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_radacct_autolink ON radacct;
CREATE TRIGGER trg_radacct_autolink
BEFORE INSERT OR UPDATE ON radacct
FOR EACH ROW EXECUTE FUNCTION trg_autolink_radius_event();

DROP TRIGGER IF EXISTS trg_radpostauth_autolink ON radpostauth;
CREATE TRIGGER trg_radpostauth_autolink
BEFORE INSERT OR UPDATE ON radpostauth
FOR EACH ROW EXECUTE FUNCTION trg_autolink_radius_event();
