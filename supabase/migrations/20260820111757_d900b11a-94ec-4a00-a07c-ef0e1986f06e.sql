CREATE TYPE public.customer_status AS ENUM ('active','expired','disabled');
CREATE TYPE public.voucher_status AS ENUM ('unused','active','used','expired');
CREATE TYPE public.txn_kind AS ENUM ('customer_payment','saas_subscription');
CREATE TYPE public.txn_status AS ENUM ('pending','success','failed','cancelled');

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  kind public.package_kind NOT NULL DEFAULT 'hotspot',
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  username text,
  mac_address text,
  status public.customer_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated USING (public.is_tenant_owner(auth.uid(), tenant_id));
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX customers_tenant_idx ON public.customers(tenant_id);

CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  code text NOT NULL,
  status public.voucher_status NOT NULL DEFAULT 'unused',
  phone text,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vouchers_select" ON public.vouchers FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "vouchers_insert" ON public.vouchers FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "vouchers_update" ON public.vouchers FOR UPDATE TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "vouchers_delete" ON public.vouchers FOR DELETE TO authenticated USING (public.is_tenant_owner(auth.uid(), tenant_id));
CREATE INDEX vouchers_tenant_idx ON public.vouchers(tenant_id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  kind public.txn_kind NOT NULL DEFAULT 'customer_payment',
  status public.txn_status NOT NULL DEFAULT 'pending',
  phone text NOT NULL,
  amount_kes integer NOT NULL,
  mpesa_receipt text,
  checkout_request_id text,
  failure_reason text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX transactions_tenant_created_idx ON public.transactions(tenant_id, created_at DESC);