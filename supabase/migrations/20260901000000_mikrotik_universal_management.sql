-- Migration for Universal MikroTik Onboarding & Remote Management System
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS configuration_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS desired_configuration_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS cpu_load text,
  ADD COLUMN IF NOT EXISTS free_memory text,
  ADD COLUMN IF NOT EXISTS total_memory text,
  ADD COLUMN IF NOT EXISTS free_hdd text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS architecture text,
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walled_garden_domains text[] DEFAULT ARRAY[]::text[];

-- Table for tracking versioned router configuration scripts
CREATE TABLE IF NOT EXISTS public.router_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL,
  script text NOT NULL,
  checksum text,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (router_id, version)
);

CREATE INDEX IF NOT EXISTS router_configs_router_idx ON public.router_configurations(router_id, version DESC);

-- Table for storing periodic router telemetry & heartbeat history
CREATE TABLE IF NOT EXISTS public.router_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cpu_load integer,
  free_memory bigint,
  uptime text,
  active_hotspot_users integer DEFAULT 0,
  active_pppoe_users integer DEFAULT 0,
  config_version integer,
  ip_address text,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS router_heartbeats_router_idx ON public.router_heartbeats(router_id, created_at DESC);

-- Table for recording router command and synchronization audit logs
CREATE TABLE IF NOT EXISTS public.router_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS router_sync_logs_router_idx ON public.router_sync_logs(router_id, created_at DESC);

-- Permissions
GRANT ALL ON public.router_configurations TO authenticated, anon, service_role;
GRANT ALL ON public.router_heartbeats TO authenticated, anon, service_role;
GRANT ALL ON public.router_sync_logs TO authenticated, anon, service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
