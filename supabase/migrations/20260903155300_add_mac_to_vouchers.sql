-- Add mac_address to vouchers table for better session management
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS mac_address text;

-- Add index for performance
CREATE INDEX IF NOT EXISTS vouchers_mac_idx ON public.vouchers(mac_address);
