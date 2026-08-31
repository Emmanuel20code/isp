CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'trialing', 'expired', 'suspended', 'cancelled')) DEFAULT 'active',
    plan_type TEXT NOT NULL DEFAULT 'standard',
    expiry_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying subscriptions by tenant
CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_idx ON public.subscriptions(tenant_id);

-- Optional: Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow superadmin full access, tenant owner read access
CREATE POLICY "Superadmins can manage all subscriptions"
    ON public.subscriptions
    FOR ALL
    TO authenticated
    USING (public.has_role('superadmin'));

CREATE POLICY "Tenants can view own subscriptions"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (public.is_tenant_member(tenant_id));

-- Trigger for updated_at
CREATE TRIGGER set_public_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

