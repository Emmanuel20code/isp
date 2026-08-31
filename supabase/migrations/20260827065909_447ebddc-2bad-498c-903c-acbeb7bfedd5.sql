CREATE TABLE IF NOT EXISTS public.platform_mpesa_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  environment text NOT NULL DEFAULT 'production',
  consumer_key text,
  consumer_secret text,
  passkey text,
  shortcode text,
  shortcode_kind public.mpesa_shortcode_type NOT NULL DEFAULT 'paybill',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_mpesa_config TO service_role;

ALTER TABLE public.platform_mpesa_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to platform mpesa config"
  ON public.platform_mpesa_config FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP TRIGGER IF EXISTS platform_mpesa_config_updated_at ON public.platform_mpesa_config;
CREATE TRIGGER platform_mpesa_config_updated_at
  BEFORE UPDATE ON public.platform_mpesa_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_mpesa_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, tenant_id)
SELECT u.id, 'super_admin'::public.app_role, NULL FROM auth.users u
WHERE u.email = 'emmanueloyaro3@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'super_admin'::public.app_role
  );