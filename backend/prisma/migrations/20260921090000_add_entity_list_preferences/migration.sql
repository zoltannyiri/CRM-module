CREATE TABLE "EntityListPreference" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "organizationMemberId" INTEGER NOT NULL,
  "entityType" "CustomFieldEntityType" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "columns" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntityListPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntityListPreference_organizationMemberId_entityType_key"
  ON "EntityListPreference"("organizationMemberId", "entityType");
CREATE INDEX "EntityListPreference_organizationId_entityType_idx"
  ON "EntityListPreference"("organizationId", "entityType");
CREATE INDEX "EntityListPreference_organizationMemberId_organizationId_idx"
  ON "EntityListPreference"("organizationMemberId", "organizationId");

ALTER TABLE "EntityListPreference" ADD CONSTRAINT "EntityListPreference_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityListPreference" ADD CONSTRAINT "EntityListPreference_organizationMemberId_organizationId_fkey"
  FOREIGN KEY ("organizationMemberId", "organizationId") REFERENCES "OrganizationMember"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
