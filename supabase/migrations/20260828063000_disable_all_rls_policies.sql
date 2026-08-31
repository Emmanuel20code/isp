-- Disable Row Level Security and remove restrictive policies across all public tables

-- 1. platform_mpesa_config
ALTER TABLE public.platform_mpesa_config DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client access to platform mpesa config" ON public.platform_mpesa_config;
DROP POLICY IF EXISTS "platform_mpesa_config_admin_manage" ON public.platform_mpesa_config;
DROP POLICY IF EXISTS "platform_mpesa_config_allow_all" ON public.platform_mpesa_config;
CREATE POLICY "platform_mpesa_config_allow_all" ON public.platform_mpesa_config FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.platform_mpesa_config TO authenticated, anon, public, service_role;

-- 2. platform_settings
ALTER TABLE public.platform_settings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_settings_read" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin_write" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_allow_all" ON public.platform_settings;
CREATE POLICY "platform_settings_allow_all" ON public.platform_settings FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.platform_settings TO authenticated, anon, public, service_role;

-- 3. audit_logs
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_allow_all" ON public.audit_logs;
CREATE POLICY "audit_logs_allow_all" ON public.audit_logs FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.audit_logs TO authenticated, anon, public, service_role;

-- 4. customers
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_allow_all" ON public.customers;
CREATE POLICY "customers_allow_all" ON public.customers FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.customers TO authenticated, anon, public, service_role;

-- 5. packages
ALTER TABLE public.packages DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "packages_allow_all" ON public.packages;
CREATE POLICY "packages_allow_all" ON public.packages FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.packages TO authenticated, anon, public, service_role;

-- 6. profiles
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_allow_all" ON public.profiles;
CREATE POLICY "profiles_allow_all" ON public.profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.profiles TO authenticated, anon, public, service_role;

-- 7. router_commands
ALTER TABLE public.router_commands DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "router_commands_allow_all" ON public.router_commands;
CREATE POLICY "router_commands_allow_all" ON public.router_commands FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.router_commands TO authenticated, anon, public, service_role;

-- 8. routers
ALTER TABLE public.routers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routers_allow_all" ON public.routers;
CREATE POLICY "routers_allow_all" ON public.routers FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.routers TO authenticated, anon, public, service_role;

-- 9. tenant_members
ALTER TABLE public.tenant_members DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_members_allow_all" ON public.tenant_members;
CREATE POLICY "tenant_members_allow_all" ON public.tenant_members FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.tenant_members TO authenticated, anon, public, service_role;

-- 10. tenant_settings
ALTER TABLE public.tenant_settings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_settings_allow_all" ON public.tenant_settings;
CREATE POLICY "tenant_settings_allow_all" ON public.tenant_settings FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.tenant_settings TO authenticated, anon, public, service_role;

-- 11. tenants
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenants_allow_all" ON public.tenants;
CREATE POLICY "tenants_allow_all" ON public.tenants FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.tenants TO authenticated, anon, public, service_role;

-- 12. transactions
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transactions_allow_all" ON public.transactions;
CREATE POLICY "transactions_allow_all" ON public.transactions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.transactions TO authenticated, anon, public, service_role;

-- 13. user_roles
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_allow_all" ON public.user_roles;
CREATE POLICY "user_roles_allow_all" ON public.user_roles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.user_roles TO authenticated, anon, public, service_role;

-- 14. vouchers
ALTER TABLE public.vouchers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers_allow_all" ON public.vouchers;
CREATE POLICY "vouchers_allow_all" ON public.vouchers FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.vouchers TO authenticated, anon, public, service_role;
