-- Full Database Schema Replacement Script for Emmatech WiFi Billing
-- Copy and paste this complete script into the Supabase SQL Editor and click 'Run'.

-- 1. DROP EXISTING TABLES & TYPES FOR CLEAN REPLACEMENT
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.router_commands CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.vouchers CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.packages CASCADE;
DROP TABLE IF EXISTS public.routers CASCADE;
DROP TABLE IF EXISTS public.tenant_settings CASCADE;
DROP TABLE IF EXISTS public.tenant_members CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.platform_settings CASCADE;
DROP TABLE IF EXISTS public.platform_mpesa_config CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.app_configurations CASCADE;

DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.subscription_status CASCADE;
DROP TYPE IF EXISTS public.mpesa_shortcode_type CASCADE;
DROP TYPE IF EXISTS public.router_status CASCADE;
DROP TYPE IF EXISTS public.package_kind CASCADE;
DROP TYPE IF EXISTS public.customer_status CASCADE;
DROP TYPE IF EXISTS public.voucher_status CASCADE;
DROP TYPE IF EXISTS public.txn_kind CASCADE;
DROP TYPE IF EXISTS public.txn_status CASCADE;
DROP TYPE IF EXISTS public.router_command_status CASCADE;

-- 2. CREATE ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('super_admin', 'tenant_owner', 'tenant_staff');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'expired', 'suspended', 'cancelled');
CREATE TYPE public.mpesa_shortcode_type AS ENUM ('till', 'paybill');
CREATE TYPE public.router_status AS ENUM ('pending', 'online', 'offline');
CREATE TYPE public.package_kind AS ENUM ('hotspot', 'pppoe');
CREATE TYPE public.customer_status AS ENUM ('active', 'expired', 'disabled');
CREATE TYPE public.voucher_status AS ENUM ('unused', 'active', 'used', 'expired');
CREATE TYPE public.txn_kind AS ENUM ('customer_payment', 'saas_subscription');
CREATE TYPE public.txn_status AS ENUM ('pending', 'success', 'failed', 'cancelled');
CREATE TYPE public.router_command_status AS ENUM ('queued', 'delivered', 'done', 'failed');

-- 3. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, tenant_id)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 6. TENANTS TABLE
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL,
  business_email TEXT,
  business_phone TEXT,
  county TEXT,
  country TEXT NOT NULL DEFAULT 'Kenya',
  mpesa_shortcode TEXT,
  mpesa_shortcode_kind public.mpesa_shortcode_type,
  mpesa_account_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trial_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_end_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
  subscription_status public.subscription_status NOT NULL DEFAULT 'trialing',
  subscription_start_at TIMESTAMPTZ,
  subscription_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_owner ON public.tenants(owner_id);
CREATE UNIQUE INDEX tenants_owner_id_key ON public.tenants(owner_id);
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.1 TENANT PAYMENT GATEWAYS TABLE
CREATE TABLE public.tenant_payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  country TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  credentials_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id)
);
CREATE INDEX idx_tenant_gateways_tenant ON public.tenant_payment_gateways(tenant_id);
CREATE TRIGGER tenant_payment_gateways_updated_at
  BEFORE UPDATE ON public.tenant_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. SUBSCRIPTIONS TABLE (Historical tracking)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  plan_type TEXT NOT NULL DEFAULT 'standard',
  expiry_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_tenant ON public.subscriptions(tenant_id);
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. TENANT MEMBERS TABLE
CREATE TABLE public.tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'tenant_staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE UNIQUE INDEX tenant_members_user_id_key ON public.tenant_members(user_id);

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = _user_id AND tenant_id = _tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id);
$$;

-- 8. TENANT SETTINGS TABLE
CREATE TABLE public.tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  portal_title TEXT,
  portal_subtitle TEXT,
  brand_color TEXT NOT NULL DEFAULT '#00A8E8',
  accent_color TEXT DEFAULT '#f97316',
  theme_preset TEXT DEFAULT 'midnight',
  announcement_text TEXT,
  card_style TEXT DEFAULT 'pill',
  logo_url TEXT,
  support_phone TEXT,
  support_email TEXT,
  terms_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. PLATFORM SETTINGS TABLE (Singleton)
CREATE TABLE public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  saas_till_number TEXT,
  subscription_price_kes INTEGER NOT NULL DEFAULT 1500,
  subscription_days INTEGER NOT NULL DEFAULT 30,
  trial_days INTEGER NOT NULL DEFAULT 3,
  warning_days INTEGER NOT NULL DEFAULT 5,
  platform_name TEXT NOT NULL DEFAULT 'Emmatech WiFi Billing',
  support_email TEXT,
  support_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id)
);
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 10. PLATFORM MPESA CONFIG TABLE (Singleton)
CREATE TABLE public.platform_mpesa_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  environment TEXT NOT NULL DEFAULT 'production',
  consumer_key TEXT,
  consumer_secret TEXT,
  passkey TEXT,
  shortcode TEXT,
  shortcode_kind public.mpesa_shortcode_type NOT NULL DEFAULT 'paybill',
  callback_base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER platform_mpesa_config_updated_at
  BEFORE UPDATE ON public.platform_mpesa_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.platform_mpesa_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 11. ROUTERS TABLE
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  agent_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.router_status NOT NULL DEFAULT 'pending',
  last_seen_at TIMESTAMPTZ,
  ros_version TEXT,
  agent_version TEXT,
  identity TEXT,
  uptime TEXT,
  active_hotspot_users INTEGER NOT NULL DEFAULT 0,
  active_pppoe_users INTEGER NOT NULL DEFAULT 0,
  onboard_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  onboard_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  onboarded_at TIMESTAMPTZ,
  public_ip TEXT,
  board_name TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX routers_tenant_idx ON public.routers(tenant_id);
CREATE UNIQUE INDEX routers_onboard_token_key ON public.routers (onboard_token);
CREATE TRIGGER routers_updated_at
  BEFORE UPDATE ON public.routers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. PACKAGES TABLE
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind public.package_kind NOT NULL DEFAULT 'hotspot',
  price_kes INTEGER NOT NULL CHECK (price_kes >= 0),
  duration_hours NUMERIC NOT NULL CHECK (duration_hours > 0),
  speed_down_mbps INTEGER NOT NULL DEFAULT 5 CHECK (speed_down_mbps > 0),
  speed_up_mbps INTEGER NOT NULL DEFAULT 5 CHECK (speed_up_mbps > 0),
  device_limit INTEGER NOT NULL DEFAULT 1 CHECK (device_limit > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX packages_tenant_idx ON public.packages(tenant_id);
CREATE TRIGGER packages_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. CUSTOMERS TABLE
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  kind public.package_kind NOT NULL DEFAULT 'hotspot',
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  username TEXT,
  mac_address TEXT,
  status public.customer_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_tenant_idx ON public.customers(tenant_id);
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 14. VOUCHERS TABLE
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status public.voucher_status NOT NULL DEFAULT 'unused',
  phone TEXT,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX vouchers_tenant_idx ON public.vouchers(tenant_id);

-- 15. TRANSACTIONS TABLE
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  kind public.txn_kind NOT NULL DEFAULT 'customer_payment',
  status public.txn_status NOT NULL DEFAULT 'pending',
  phone TEXT NOT NULL,
  amount_kes INTEGER NOT NULL,
  mpesa_receipt TEXT,
  checkout_request_id TEXT,
  failure_reason TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_tenant_created_idx ON public.transactions(tenant_id, created_at DESC);
CREATE UNIQUE INDEX transactions_checkout_request_id_key ON public.transactions (checkout_request_id) WHERE checkout_request_id IS NOT NULL;

-- 16. ROUTER COMMANDS TABLE
CREATE TABLE public.router_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.router_command_status NOT NULL DEFAULT 'queued',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX router_commands_router_status_idx ON public.router_commands(router_id, status, created_at);

-- 17. AUDIT LOGS TABLE
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);

-- 18. USER SETTINGS TABLE
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  theme TEXT NOT NULL DEFAULT 'system',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_notifications BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_settings_user_id ON public.user_settings(user_id);
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 19. APP CONFIGURATIONS TABLE
CREATE TABLE public.app_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_configurations_key ON public.app_configurations(key);
CREATE INDEX idx_app_configurations_category ON public.app_configurations(category);
CREATE TRIGGER app_configurations_updated_at
  BEFORE UPDATE ON public.app_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20. AUTH USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 21. PERMISSIONS & OPEN ACCESS GRANTS
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- Disable Row Level Security across tables to grant open access
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_mpesa_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.routers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.router_commands DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_configurations DISABLE ROW LEVEL SECURITY;

-- 22. SEED INITIAL APP CONFIGURATIONS
INSERT INTO public.app_configurations (key, value, description, category, is_public)
VALUES 
  ('site_name', '"Emmatech WiFi Billing"'::jsonb, 'Application brand display name', 'branding', true),
  ('maintenance_mode', 'false'::jsonb, 'Global system maintenance toggle', 'system', true),
  ('default_timezone', '"Africa/Nairobi"'::jsonb, 'Default platform timezone', 'localization', true),
  ('support_contact', '{"phone": "+254700000000", "email": "support@emmatech.co.ke"}'::jsonb, 'Support contact info', 'branding', true)
ON CONFLICT (key) DO NOTHING;

-- 23. AUTO-ASSIGN SUPER ADMIN FOR ADMIN EMAILS
INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT u.id, 'super_admin'::public.app_role, NULL
FROM auth.users u
WHERE LOWER(u.email) IN ('emmanueloyaro123@gmail.com', 'emmanueloyaro3@gmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'super_admin'::public.app_role
  );
