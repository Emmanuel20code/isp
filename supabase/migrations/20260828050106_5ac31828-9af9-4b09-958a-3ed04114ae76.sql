ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS onboard_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS onboard_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_ip text,
  ADD COLUMN IF NOT EXISTS board_name text,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS routers_onboard_token_key ON public.routers (onboard_token);