ALTER TABLE public.platform_mpesa_config
  ADD COLUMN IF NOT EXISTS callback_base_url text;