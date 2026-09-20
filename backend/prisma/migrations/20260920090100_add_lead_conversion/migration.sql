CREATE UNIQUE INDEX "Partner_id_organizationId_key" ON "Partner"("id", "organizationId");

ALTER TABLE "Lead"
  ADD COLUMN "convertedAt" TIMESTAMPTZ(3),
  ADD COLUMN "convertedPartnerId" INTEGER,
  ADD COLUMN "convertedByMemberId" INTEGER,
  ADD CONSTRAINT "Lead_conversion_state_check" CHECK (
    "convertedAt" IS NOT NULL OR ("convertedPartnerId" IS NULL AND "convertedByMemberId" IS NULL)
  );

CREATE INDEX "Lead_convertedPartnerId_organizationId_idx" ON "Lead"("convertedPartnerId", "organizationId");
CREATE INDEX "Lead_convertedByMemberId_organizationId_idx" ON "Lead"("convertedByMemberId", "organizationId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedPartnerId_organizationId_fkey"
  FOREIGN KEY ("convertedPartnerId", "organizationId")
  REFERENCES "Partner"("id", "organizationId")
  ON DELETE SET NULL ("convertedPartnerId") ON UPDATE CASCADE;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedByMemberId_organizationId_fkey"
  FOREIGN KEY ("convertedByMemberId", "organizationId")
  REFERENCES "OrganizationMember"("id", "organizationId")
  ON DELETE SET NULL ("convertedByMemberId") ON UPDATE CASCADE;

INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", 'LEADS_CONVERT'::"PermissionKey", CURRENT_TIMESTAMP
FROM "OrganizationMember" AS member
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
