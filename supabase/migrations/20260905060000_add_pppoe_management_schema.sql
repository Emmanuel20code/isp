-- PPPoE Management & Customer Schema Migration

-- 1. Ensure customers table has all required PPPoE fields
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS kind text DEFAULT 'hotspot';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS mac_address text;

-- Add foreign key constraints safely if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='customers' AND column_name='package_id'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='customers' AND column_name='router_id'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Ensure packages table has PPPoE fields
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS kind text DEFAULT 'hotspot';
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS speed_up_mbps integer DEFAULT 10;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS speed_down_mbps integer DEFAULT 10;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS duration_hours numeric DEFAULT 24;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS price_kes integer DEFAULT 0;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 3. Ensure routers table has PPPoE status fields
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS active_pppoe_users integer DEFAULT 0;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS active_hotspot_users integer DEFAULT 0;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false;

-- 4. Ensure router_commands table exists
CREATE TABLE IF NOT EXISTS public.router_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  completed_at timestamptz
);

-- 5. Ensure router_sync_logs table exists
CREATE TABLE IF NOT EXISTS public.router_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
