REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(uuid, uuid) FROM authenticated, anon, public;