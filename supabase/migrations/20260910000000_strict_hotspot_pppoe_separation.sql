-- Migration: Strict Hotspot and PPPoE RADIUS Separation & Device Binding
-- Enforces strict separation between Hotspot and PPPoE authentication
-- Binds Hotspot vouchers to individual client Calling-Station-Id (client MAC)
-- Prevents unauthorized devices or PPPoE clients from piggybacking on Hotspot vouchers

-- 1. Helper function to generate case-insensitive, flexible MAC address regex
CREATE OR REPLACE FUNCTION build_mac_regex(p_mac text)
RETURNS text AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_mac IS NULL OR TRIM(p_mac) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-hex characters
  v_clean := UPPER(REGEXP_REPLACE(p_mac, '[^a-fA-F0-9]', '', 'g'));
  
  IF LENGTH(v_clean) <> 12 THEN
    RETURN NULL;
  END IF;

  RETURN '(?i)^' || 
         SUBSTR(v_clean, 1, 2) || '[:-]?' ||
         SUBSTR(v_clean, 3, 2) || '[:-]?' ||
         SUBSTR(v_clean, 5, 2) || '[:-]?' ||
         SUBSTR(v_clean, 7, 2) || '[:-]?' ||
         SUBSTR(v_clean, 9, 2) || '[:-]?' ||
         SUBSTR(v_clean, 11, 2) || '$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Add reason column to radpostauth for detailed diagnostic logging
ALTER TABLE radpostauth ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS mac_address TEXT;
CREATE INDEX IF NOT EXISTS idx_vouchers_mac_address ON vouchers(mac_address);

-- 3. Customer RADIUS sync trigger function with strict PPPoE vs Hotspot checks
CREATE OR REPLACE FUNCTION sync_customer_to_radius()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_active BOOLEAN := false;
  v_rate_limit TEXT := '5M/10M';
  v_session_timeout INT := 86400;
  v_is_valid BOOLEAN := false;
  v_speed_up INT;
  v_speed_down INT;
  v_mac_regex TEXT;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.username IS NOT NULL THEN
      DELETE FROM radcheck WHERE username = OLD.username;
      DELETE FROM radreply WHERE username = OLD.username;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.username IS NULL THEN
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

  -- Clear existing radcheck / radreply
  DELETE FROM radcheck WHERE username = NEW.username;
  DELETE FROM radreply WHERE username = NEW.username;

  IF v_is_valid THEN
    -- Insert Cleartext-Password
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.username, 'Cleartext-Password', ':=', COALESCE(NEW.password, NEW.username), NEW.tenant_id, NEW.tenant_id);

    IF NEW.kind = 'pppoe' THEN
      -- STRICT PPPoE: Framed-Protocol == PPP
      INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.username, 'Framed-Protocol', '==', 'PPP', NEW.tenant_id, NEW.tenant_id);

      INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
      VALUES 
        (NEW.username, 'Mikrotik-Rate-Limit', ':=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
        (NEW.username, 'Framed-Protocol', ':=', 'PPP', NEW.tenant_id, NEW.tenant_id),
        (NEW.username, 'Service-Type', ':=', 'Framed-User', NEW.tenant_id, NEW.tenant_id),
        (NEW.username, 'Port-Limit', ':=', '1', NEW.tenant_id, NEW.tenant_id);
    ELSE
      -- STRICT Hotspot: Framed-Protocol != PPP
      INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.username, 'Framed-Protocol', '!=', 'PPP', NEW.tenant_id, NEW.tenant_id);

      -- Bind MAC address if present
      v_mac_regex := build_mac_regex(NEW.mac_address);
      IF v_mac_regex IS NOT NULL THEN
        INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
        VALUES (NEW.username, 'Calling-Station-Id', '=~', v_mac_regex, NEW.tenant_id, NEW.tenant_id);
      END IF;

      INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
      VALUES 
        (NEW.username, 'Mikrotik-Rate-Limit', ':=', v_rate_limit, NEW.tenant_id, NEW.tenant_id),
        (NEW.username, 'Port-Limit', ':=', '1', NEW.tenant_id, NEW.tenant_id);
    END IF;

    IF NEW.expires_at IS NOT NULL THEN
      v_session_timeout := GREATEST(60, EXTRACT(EPOCH FROM (NEW.expires_at - NOW()))::INT);
      INSERT INTO radreply (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.username, 'Session-Timeout', ':=', v_session_timeout::TEXT, NEW.tenant_id, NEW.tenant_id);
    END IF;
  ELSE
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

-- 4. Voucher RADIUS sync trigger function with strict MAC binding and service isolation
CREATE OR REPLACE FUNCTION sync_voucher_to_radius()
RETURNS TRIGGER AS $$
DECLARE
  v_rate_limit TEXT := '5M/10M';
  v_session_timeout INT := 3600;
  v_is_valid BOOLEAN := false;
  v_speed_up INT;
  v_speed_down INT;
  v_duration_hour NUMERIC;
  v_mac_regex TEXT;
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
    -- Cleartext Password (code)
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Cleartext-Password', ':=', NEW.code, NEW.tenant_id, NEW.tenant_id);

    -- STRICT Hotspot: Framed-Protocol != PPP
    INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
    VALUES (NEW.code, 'Framed-Protocol', '!=', 'PPP', NEW.tenant_id, NEW.tenant_id);

    -- Bind MAC address if present
    v_mac_regex := build_mac_regex(NEW.mac_address);
    IF v_mac_regex IS NOT NULL THEN
      INSERT INTO radcheck (username, attribute, op, value, tenant_id, "tenantId")
      VALUES (NEW.code, 'Calling-Station-Id', '=~', v_mac_regex, NEW.tenant_id, NEW.tenant_id);
    END IF;

    -- Reply attributes
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

-- 5. Auto-bind Hotspot MAC address on first successful RADIUS authentication
CREATE OR REPLACE FUNCTION auto_bind_hotspot_mac_on_postauth()
RETURNS TRIGGER AS $$
DECLARE
  v_clean_mac TEXT;
  v_mac_regex TEXT;
BEGIN
  IF NEW.reply = 'Access-Accept' AND NEW.callingstationid IS NOT NULL AND TRIM(NEW.callingstationid) <> '' AND NEW.callingstationid <> '00:00:00:00:00:00' THEN
    v_clean_mac := UPPER(NEW.callingstationid);
    v_mac_regex := build_mac_regex(v_clean_mac);

    IF v_mac_regex IS NOT NULL THEN
      -- Auto-bind voucher if mac_address was empty
      UPDATE vouchers
      SET mac_address = v_clean_mac
      WHERE code = NEW.username AND (mac_address IS NULL OR mac_address = '');

      -- Auto-bind hotspot customer if mac_address was empty
      UPDATE customers
      SET mac_address = v_clean_mac
      WHERE username = NEW.username AND kind = 'hotspot' AND (mac_address IS NULL OR mac_address = '');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_bind_hotspot_mac ON radpostauth;
CREATE TRIGGER trg_auto_bind_hotspot_mac
AFTER INSERT ON radpostauth
FOR EACH ROW EXECUTE FUNCTION auto_bind_hotspot_mac_on_postauth();
