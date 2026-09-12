-- Remove the unquoted 'tenantid' column which is causing duplication/conflicts
-- and ensure 'tenantId' (quoted) is the primary one used by triggers.

ALTER TABLE nas DROP COLUMN IF EXISTS tenantid;
ALTER TABLE radcheck DROP COLUMN IF EXISTS tenantid;
ALTER TABLE radreply DROP COLUMN IF EXISTS tenantid;
