ALTER TYPE "PermissionKey" ADD VALUE 'PIPELINE_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'PIPELINE_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'PIPELINE_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'PIPELINE_DELETE';
ALTER TYPE "ActivityAction" ADD VALUE 'PIPELINE_STAGE_CHANGED';

CREATE TABLE "Pipeline" (
 "id" SERIAL PRIMARY KEY,
 "organizationId" INTEGER NOT NULL,
 "name" TEXT NOT NULL,
 "isDefault" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PipelineStage" (
 "id" SERIAL PRIMARY KEY,
 "organizationId" INTEGER NOT NULL,
 "pipelineId" INTEGER NOT NULL,
 "name" TEXT NOT NULL,
 "position" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "LeadPipelinePosition" (
 "id" SERIAL PRIMARY KEY,
 "organizationId" INTEGER NOT NULL,
 "leadId" INTEGER NOT NULL,
 "pipelineId" INTEGER NOT NULL,
 "pipelineStageId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Lead_id_organizationId_key" ON "Lead"("id", "organizationId");
CREATE UNIQUE INDEX "Pipeline_id_organizationId_key" ON "Pipeline"("id", "organizationId");
CREATE INDEX "Pipeline_organizationId_idx" ON "Pipeline"("organizationId");
-- At most one default, also enforced for concurrent requests and direct database writes.
CREATE UNIQUE INDEX "Pipeline_one_default_per_organization" ON "Pipeline"("organizationId") WHERE "isDefault" = true;
CREATE UNIQUE INDEX "PipelineStage_id_pipelineId_organizationId_key" ON "PipelineStage"("id", "pipelineId", "organizationId");
CREATE UNIQUE INDEX "PipelineStage_pipelineId_position_key" ON "PipelineStage"("pipelineId", "position");
CREATE INDEX "PipelineStage_organizationId_idx" ON "PipelineStage"("organizationId");
CREATE UNIQUE INDEX "LeadPipelinePosition_leadId_key" ON "LeadPipelinePosition"("leadId");
CREATE UNIQUE INDEX "LeadPipelinePosition_leadId_organizationId_key" ON "LeadPipelinePosition"("leadId", "organizationId");
CREATE INDEX "LeadPipelinePosition_organizationId_pipelineId_idx" ON "LeadPipelinePosition"("organizationId", "pipelineId");
CREATE INDEX "LeadPipelinePosition_pipelineStageId_pipelineId_organizatio_idx" ON "LeadPipelinePosition"("pipelineStageId", "pipelineId", "organizationId");
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_organizationId_fkey" FOREIGN KEY ("pipelineId", "organizationId") REFERENCES "Pipeline"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadPipelinePosition" ADD CONSTRAINT "LeadPipelinePosition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadPipelinePosition" ADD CONSTRAINT "LeadPipelinePosition_leadId_organizationId_fkey" FOREIGN KEY ("leadId", "organizationId") REFERENCES "Lead"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadPipelinePosition" ADD CONSTRAINT "LeadPipelinePosition_pipelineId_organizationId_fkey" FOREIGN KEY ("pipelineId", "organizationId") REFERENCES "Pipeline"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadPipelinePosition" ADD CONSTRAINT "LeadPipelinePosition_pipelineStageId_pipelineId_organizati_fkey" FOREIGN KEY ("pipelineStageId", "pipelineId", "organizationId") REFERENCES "PipelineStage"("id", "pipelineId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationModule" ("organizationId", "module", "enabled", "createdAt", "updatedAt")
SELECT "id", 'PIPELINE'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization"
ON CONFLICT ("organizationId", "module") DO NOTHING;
INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", permission."permission", CURRENT_TIMESTAMP FROM "OrganizationMember" AS member
CROSS JOIN (VALUES ('PIPELINE_VIEW'::"PermissionKey"), ('PIPELINE_CREATE'::"PermissionKey"), ('PIPELINE_EDIT'::"PermissionKey"), ('PIPELINE_DELETE'::"PermissionKey")) AS permission("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;

-- Existing Leads deliberately stay unassigned.
INSERT INTO "Pipeline" ("organizationId", "name", "isDefault", "createdAt", "updatedAt")
SELECT org."id", 'Értékesítés', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization" org
WHERE NOT EXISTS (SELECT 1 FROM "Pipeline" p WHERE p."organizationId" = org."id");
INSERT INTO "PipelineStage" ("organizationId", "pipelineId", "name", "position", "createdAt", "updatedAt")
SELECT p."organizationId", p."id", stages.name, stages.position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Pipeline" p
CROSS JOIN (VALUES ('Új érdeklődő', 1), ('Kapcsolatfelvétel', 2), ('Igényfelmérés', 3), ('Ajánlat', 4), ('Tárgyalás', 5), ('Megnyert', 6), ('Elveszett', 7)) AS stages(name, position)
WHERE p."isDefault" = true AND NOT EXISTS (SELECT 1 FROM "PipelineStage" s WHERE s."pipelineId" = p."id");
