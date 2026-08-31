-- Migration: Add tenants table with country column and tenant payment gateways
CREATE TABLE IF NOT EXISTS public.tenants (
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
  is_active BOOLEAN NOT NULL DEFAULT true,
  trial_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_end_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
  subscription_status public.subscription_status NOT NULL DEFAULT 'trialing',
  subscription_start_at TIMESTAMPTZ,
  subscription_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure country column exists if table was already created without it
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'country') THEN
    ALTER TABLE public.tenants ADD COLUMN country TEXT NOT NULL DEFAULT 'Kenya';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tenant_payment_gateways (
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

ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payment_gateways DISABLE ROW LEVEL SECURITY;
