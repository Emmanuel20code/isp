create or replace function public.portal_tenant(_slug text)
returns table (
  tenant_id uuid,
  business_name text,
  portal_title text,
  portal_subtitle text,
  brand_color text,
  logo_url text,
  support_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, s.portal_title, s.portal_subtitle,
         coalesce(s.brand_color, '#00A8E8'), s.logo_url, s.support_phone
  from public.tenants t
  left join public.tenant_settings s on s.tenant_id = t.id
  where t.slug = _slug and t.is_active = true
  limit 1
$$;

create or replace function public.portal_packages(_slug text)
returns table (
  id uuid,
  name text,
  kind package_kind,
  price_kes integer,
  duration_hours integer,
  speed_down_mbps integer,
  speed_up_mbps integer,
  device_limit integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.kind, p.price_kes, p.duration_hours,
         p.speed_down_mbps, p.speed_up_mbps, p.device_limit
  from public.packages p
  join public.tenants t on t.id = p.tenant_id
  where t.slug = _slug and t.is_active = true and p.is_active = true
  order by p.price_kes asc
$$;

revoke all on function public.portal_tenant(text) from public;
revoke all on function public.portal_packages(text) from public;
grant execute on function public.portal_tenant(text) to anon, authenticated, service_role;
grant execute on function public.portal_packages(text) to anon, authenticated, service_role;