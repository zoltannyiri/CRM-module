-- Commit enum additions before the following migration uses LEADS_CONVERT in backfill SQL.
ALTER TYPE "PermissionKey" ADD VALUE 'LEADS_CONVERT';
ALTER TYPE "ActivityAction" ADD VALUE 'LEAD_CONVERTED';
