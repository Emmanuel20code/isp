-- Migration to add mpesa_account_ref to public.tenants table and reload Supabase PostgREST schema cache
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS mpesa_account_ref TEXT;

-- Reload Supabase PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
