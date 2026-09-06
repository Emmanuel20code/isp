CREATE TYPE public.router_command_status AS ENUM ('queued','delivered','done','failed');

CREATE TABLE public.router_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  router_id uuid not null references public.routers(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.router_command_status not null default 'queued',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX router_commands_router_status_idx ON public.router_commands(router_id, status, created_at);

GRANT SELECT ON public.router_commands TO authenticated;
GRANT ALL ON public.router_commands TO service_role;

ALTER TABLE public.router_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their tenant commands"
ON public.router_commands FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS agent_version text,
  ADD COLUMN IF NOT EXISTS identity text,
  ADD COLUMN IF NOT EXISTS uptime text,
  ADD COLUMN IF NOT EXISTS active_hotspot_users integer not null default 0,
  ADD COLUMN IF NOT EXISTS active_pppoe_users integer not null default 0;