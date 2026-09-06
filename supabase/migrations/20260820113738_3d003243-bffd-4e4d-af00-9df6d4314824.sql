CREATE UNIQUE INDEX IF NOT EXISTS transactions_checkout_request_id_key
  ON public.transactions (checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_tenant_created_idx
  ON public.transactions (tenant_id, created_at DESC);

GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.vouchers TO service_role;
GRANT ALL ON public.audit_logs TO service_role;