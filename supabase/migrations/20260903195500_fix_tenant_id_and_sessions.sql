-- Migration to fix missing tenant_id column in router_heartbeats and normalize session tracking

-- 1. FIX: router_heartbeats tenant_id (Resolves ERROR: 42703)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'router_heartbeats' AND column_name = 'tenant_id') THEN
    ALTER TABLE public.router_heartbeats ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
    
    -- Backfill tenant_id from routers table
    UPDATE public.router_heartbeats hb 
    SET tenant_id = r.tenant_id 
    FROM public.routers r 
    WHERE hb.router_id = r.id;
    
    -- Now make it NOT NULL once backfilled
    ALTER TABLE public.router_heartbeats ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- 2. ENUM: Session status types
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
    CREATE TYPE public.session_status AS ENUM ('PENDING', 'ACTIVE', 'ONLINE', 'EXPIRED', 'DISCONNECTED');
  END IF;
END $$;

-- 3. TABLE: public.sessions (Tenant-scoped session tracking)
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  
  username TEXT NOT NULL,
  mac_address TEXT,
  ip_address TEXT,
  
  status public.session_status NOT NULL DEFAULT 'PENDING',
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  bytes_in BIGINT DEFAULT 0,
  bytes_out BIGINT DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. INDICES
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON public.sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at) WHERE (status IN ('ACTIVE', 'ONLINE'));
CREATE INDEX IF NOT EXISTS idx_sessions_mac ON public.sessions(mac_address);

-- 5. RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'sessions_tenant_isolation') THEN
    CREATE POLICY "sessions_tenant_isolation" ON public.sessions
      FOR SELECT TO authenticated
      USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- 6. PERMISSIONS
GRANT ALL ON public.sessions TO authenticated, service_role;

-- 7. BACKFILL: Migrate existing active vouchers and customers to sessions table
DO $$
BEGIN
  -- Backfill from active vouchers
  INSERT INTO public.sessions (
    tenant_id, 
    customer_id, 
    router_id, 
    package_id, 
    voucher_id, 
    username, 
    mac_address, 
    status, 
    started_at, 
    activated_at, 
    expires_at
  )
  SELECT 
    v.tenant_id,
    c.id as customer_id,
    v.router_id,
    v.package_id,
    v.id as voucher_id,
    v.code as username,
    v.mac_address,
    'ACTIVE' as status,
    v.created_at as started_at,
    v.activated_at,
    v.expires_at
  FROM public.vouchers v
  LEFT JOIN public.customers c ON c.tenant_id = v.tenant_id AND c.phone = v.phone
  WHERE v.status = 'active' AND v.expires_at > now()
  ON CONFLICT DO NOTHING;

  -- Backfill from active customers (primarily for PPPoE or non-voucher users)
  INSERT INTO public.sessions (
    tenant_id, 
    customer_id, 
    router_id, 
    package_id, 
    username, 
    mac_address, 
    status, 
    started_at, 
    activated_at, 
    expires_at
  )
  SELECT 
    c.tenant_id,
    c.id as customer_id,
    c.router_id,
    c.package_id,
    c.username,
    c.mac_address,
    'ACTIVE' as status,
    c.created_at as started_at,
    c.created_at as activated_at, -- Approximation
    c.expires_at
  FROM public.customers c
  WHERE c.status = 'active' AND c.expires_at > now()
  AND NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.customer_id = c.id AND s.status = 'ACTIVE')
  ON CONFLICT DO NOTHING;
END $$;
