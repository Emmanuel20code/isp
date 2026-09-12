-- Fix missing tenantid columns in RADIUS tables to match trigger expectations
ALTER TABLE nas ADD COLUMN IF NOT EXISTS tenantid UUID;
ALTER TABLE radcheck ADD COLUMN IF NOT EXISTS tenantid UUID;
ALTER TABLE radreply ADD COLUMN IF NOT EXISTS tenantid UUID;

-- Also update triggers to reference the existing tenant_id column if needed, 
-- but this migration might be enough if the triggers are just looking for 'tenantid'.

-- Actually, if I already have tenant_id, maybe I should just create a view or rename? 
-- No, adding the column is safest to avoid breaking triggers.

-- Let's just add the columns.
