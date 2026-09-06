-- Migration to ensure tables for AI operations, router heartbeats, access grants, notifications, etc. exist.

CREATE TABLE IF NOT EXISTS public.ai_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL DEFAULT 'ox-alpha',
  action TEXT NOT NULL,
  tool TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'completed',
  user_id UUID,
  tenant_id UUID,
  router_id UUID,
  customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_created ON public.ai_action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_tenant ON public.ai_action_logs(tenant_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_grants_customer ON public.access_grants(customer_id);

CREATE TABLE IF NOT EXISTS public.router_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  cpu_load INTEGER,
  free_memory_mb INTEGER,
  total_memory_mb INTEGER,
  uptime TEXT,
  ros_version TEXT,
  active_hotspot_users INTEGER DEFAULT 0,
  active_pppoe_users INTEGER DEFAULT 0,
  wan_status TEXT DEFAULT 'online',
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_router_heartbeats_router ON public.router_heartbeats(router_id, created_at DESC);

-- Disable RLS on new tables for simple open access
ALTER TABLE public.ai_action_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.router_heartbeats DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
