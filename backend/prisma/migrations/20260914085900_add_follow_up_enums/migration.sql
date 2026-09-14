-- Commit enum additions before a later migration uses them in backfill SQL.
ALTER TYPE "PermissionKey" ADD VALUE 'FOLLOW_UPS_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'FOLLOW_UPS_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'FOLLOW_UPS_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'FOLLOW_UPS_DELETE';
ALTER TYPE "PermissionKey" ADD VALUE 'FOLLOW_UPS_COMPLETE';
ALTER TYPE "ActivityEntityType" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "ActivityAction" ADD VALUE 'FOLLOW_UP_COMPLETED';
