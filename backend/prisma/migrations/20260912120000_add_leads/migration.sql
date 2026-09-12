ALTER TYPE "PermissionKey" ADD VALUE 'LEADS_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'LEADS_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'LEADS_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'LEADS_DELETE';
ALTER TYPE "ActivityEntityType" ADD VALUE 'LEAD';
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'LOST');
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'REFERRAL', 'PHONE', 'EMAIL', 'SOCIAL', 'OTHER');
CREATE TABLE "Lead" (
 "id" SERIAL NOT NULL,
 "organizationId" INTEGER NOT NULL,
 "name" TEXT NOT NULL,
 "companyName" TEXT,
 "email" TEXT,
 "phone" TEXT,
 "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
 "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
 "note" TEXT,
 "assignedMemberId" INTEGER,
 "createdByMemberId" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");
CREATE INDEX "Lead_organizationId_source_idx" ON "Lead"("organizationId", "source");
CREATE INDEX "Lead_organizationId_assignedMemberId_idx" ON "Lead"("organizationId", "assignedMemberId");
CREATE INDEX "Lead_assignedMemberId_idx" ON "Lead"("assignedMemberId");
CREATE INDEX "Lead_createdByMemberId_idx" ON "Lead"("createdByMemberId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "OrganizationModule" ("organizationId", "module", "enabled", "createdAt", "updatedAt")
SELECT "id", 'LEADS'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "module") DO NOTHING;

INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", permission."permission", CURRENT_TIMESTAMP
FROM "OrganizationMember" AS member
CROSS JOIN (
  VALUES
    ('LEADS_VIEW'::"PermissionKey"),
    ('LEADS_CREATE'::"PermissionKey"),
    ('LEADS_EDIT'::"PermissionKey"),
    ('LEADS_DELETE'::"PermissionKey")
) AS permission("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
