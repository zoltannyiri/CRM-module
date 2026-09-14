CREATE TYPE "FollowUpType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'OTHER');
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE UNIQUE INDEX "OrganizationMember_id_organizationId_key" ON "OrganizationMember"("id", "organizationId");
CREATE TABLE "FollowUp" (
 "id" SERIAL PRIMARY KEY,
 "organizationId" INTEGER NOT NULL,
 "leadId" INTEGER NOT NULL,
 "assignedMemberId" INTEGER,
 "createdByMemberId" INTEGER,
 "type" "FollowUpType" NOT NULL DEFAULT 'OTHER',
 "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
 "dueAt" TIMESTAMPTZ(3) NOT NULL,
 "note" TEXT,
 "completedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "FollowUp_completion_check" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL)),
 CONSTRAINT "FollowUp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "FollowUp_leadId_organizationId_fkey" FOREIGN KEY ("leadId", "organizationId") REFERENCES "Lead"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
 -- Only clear the nullable member ID, never the tenant ID (PostgreSQL 15+).
 CONSTRAINT "FollowUp_assignedMemberId_organizationId_fkey" FOREIGN KEY ("assignedMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE SET NULL ("assignedMemberId") ON UPDATE CASCADE,
 CONSTRAINT "FollowUp_createdByMemberId_organizationId_fkey" FOREIGN KEY ("createdByMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE SET NULL ("createdByMemberId") ON UPDATE CASCADE
);
CREATE INDEX "FollowUp_organizationId_status_dueAt_idx" ON "FollowUp"("organizationId", "status", "dueAt");
CREATE INDEX "FollowUp_organizationId_assignedMemberId_status_dueAt_idx" ON "FollowUp"("organizationId", "assignedMemberId", "status", "dueAt");
CREATE INDEX "FollowUp_leadId_organizationId_status_dueAt_idx" ON "FollowUp"("leadId", "organizationId", "status", "dueAt");
CREATE INDEX "FollowUp_assignedMemberId_organizationId_idx" ON "FollowUp"("assignedMemberId", "organizationId");
CREATE INDEX "FollowUp_createdByMemberId_organizationId_idx" ON "FollowUp"("createdByMemberId", "organizationId");
INSERT INTO "OrganizationModule" ("organizationId", "module", "enabled", "createdAt", "updatedAt")
SELECT "id", 'FOLLOW_UPS'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization"
ON CONFLICT ("organizationId", "module") DO NOTHING;
INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", permission."permission", CURRENT_TIMESTAMP FROM "OrganizationMember" member
CROSS JOIN (VALUES ('FOLLOW_UPS_VIEW'::"PermissionKey"), ('FOLLOW_UPS_CREATE'::"PermissionKey"), ('FOLLOW_UPS_EDIT'::"PermissionKey"), ('FOLLOW_UPS_DELETE'::"PermissionKey"), ('FOLLOW_UPS_COMPLETE'::"PermissionKey")) permission("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
