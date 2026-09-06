-- Migration for user settings and application configuration tables

-- 1. USER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_notifications BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_id_key UNIQUE (user_id)
);

-- Index on user_id for quick lookup
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Trigger for auto updated_at
DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permissions & Access Controls for user_settings
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated, anon;
GRANT ALL ON public.user_settings TO service_role;


-- 2. APPLICATION CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS public.app_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on key and category
CREATE INDEX IF NOT EXISTS idx_app_configurations_key ON public.app_configurations(key);
CREATE INDEX IF NOT EXISTS idx_app_configurations_category ON public.app_configurations(category);

-- Trigger for auto updated_at
DROP TRIGGER IF EXISTS app_configurations_updated_at ON public.app_configurations;
CREATE TRIGGER app_configurations_updated_at
  BEFORE UPDATE ON public.app_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permissions & Access Controls for app_configurations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_configurations TO authenticated, anon;
GRANT ALL ON public.app_configurations TO service_role;

-- Seed default initial application configurations
INSERT INTO public.app_configurations (key, value, description, category, is_public)
VALUES 
  ('site_name', '"Emmatech WiFi Billing"'::jsonb, 'Application brand display name', 'branding', true),
  ('maintenance_mode', 'false'::jsonb, 'Global system maintenance toggle', 'system', true),
  ('default_timezone', '"Africa/Nairobi"'::jsonb, 'Default platform timezone', 'localization', true),
  ('support_contact', '{"phone": "+254700000000", "email": "support@emmatech.co.ke"}'::jsonb, 'Support contact info', 'branding', true)
ON CONFLICT (key) DO NOTHING;
