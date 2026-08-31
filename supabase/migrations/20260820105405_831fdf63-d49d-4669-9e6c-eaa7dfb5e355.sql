CREATE TYPE public.router_status AS ENUM ('pending','online','offline');
CREATE TYPE public.package_kind AS ENUM ('hotspot','pppoe');

CREATE TABLE public.routers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  location text,
  agent_key text not null default encode(gen_random_bytes(24),'hex'),
  status public.router_status not null default 'pending',
  last_seen_at timestamptz,
  ros_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX routers_tenant_idx ON public.routers(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read routers" ON public.routers FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Members insert routers" ON public.routers FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Members update routers" ON public.routers FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Owners delete routers" ON public.routers FOR DELETE TO authenticated USING (public.is_tenant_owner(auth.uid(), tenant_id));
CREATE TRIGGER routers_updated_at BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind public.package_kind not null default 'hotspot',
  price_kes integer not null check (price_kes >= 0),
  duration_hours integer not null check (duration_hours > 0),
  speed_down_mbps integer not null default 5 check (speed_down_mbps > 0),
  speed_up_mbps integer not null default 5 check (speed_up_mbps > 0),
  device_limit integer not null default 1 check (device_limit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX packages_tenant_idx ON public.packages(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read packages" ON public.packages FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Members insert packages" ON public.packages FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Members update packages" ON public.packages FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Owners delete packages" ON public.packages FOR DELETE TO authenticated USING (public.is_tenant_owner(auth.uid(), tenant_id));
CREATE TRIGGER packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();