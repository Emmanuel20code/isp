-- remove duplicate empty businesses, keeping each owner's first one
WITH ranked AS (
  SELECT id, owner_id, row_number() OVER (PARTITION BY owner_id ORDER BY created_at) rn
  FROM public.tenants
), dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.tenants WHERE id IN (SELECT id FROM dupes);

DELETE FROM public.user_roles ur
WHERE ur.tenant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = ur.tenant_id);

-- one business per user, enforced by the database
CREATE UNIQUE INDEX IF NOT EXISTS tenants_owner_id_key ON public.tenants(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_members_user_id_key ON public.tenant_members(user_id);