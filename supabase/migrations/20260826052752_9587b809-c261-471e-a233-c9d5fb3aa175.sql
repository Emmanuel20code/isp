-- 1. Lock down SECURITY DEFINER portal helpers (now called only from trusted server code)
REVOKE ALL ON FUNCTION public.portal_tenant(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_packages(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_tenant(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_packages(text) TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tenant_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. platform_settings: no anonymous reads
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.platform_settings FROM anon;

-- 3. router_commands: explicit write lock for client roles
REVOKE INSERT, UPDATE, DELETE ON public.router_commands FROM anon, authenticated;
REVOKE ALL ON public.router_commands FROM anon;
GRANT SELECT ON public.router_commands TO authenticated;
GRANT ALL ON public.router_commands TO service_role;

CREATE POLICY router_commands_no_client_insert ON public.router_commands
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY router_commands_no_client_update ON public.router_commands
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY router_commands_no_client_delete ON public.router_commands
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);