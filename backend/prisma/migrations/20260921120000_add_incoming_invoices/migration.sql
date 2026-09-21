ALTER TYPE "ActivityEntityType" ADD VALUE 'INCOMING_INVOICE';
ALTER TYPE "ActivityAction" ADD VALUE 'DOCUMENT_ATTACHED';
ALTER TYPE "ActivityAction" ADD VALUE 'DOCUMENT_REMOVED';
ALTER TYPE "ModuleKey" ADD VALUE 'INCOMING_INVOICES';
ALTER TYPE "PermissionKey" ADD VALUE 'INCOMING_INVOICES_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'INCOMING_INVOICES_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'INCOMING_INVOICES_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'INCOMING_INVOICES_DELETE';
ALTER TYPE "DocumentEntityType" ADD VALUE 'OFFER';
ALTER TYPE "DocumentEntityType" ADD VALUE 'INCOMING_INVOICE';

CREATE TYPE "IncomingInvoiceStatus" AS ENUM ('DRAFT', 'RECEIVED', 'APPROVED', 'PAID', 'REJECTED');

UPDATE "Document" SET "category" = 'GENERAL' WHERE "category" IS NULL OR btrim("category") = '';
ALTER TABLE "Document" ALTER COLUMN "category" SET DEFAULT 'GENERAL';
ALTER TABLE "Document" ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "DocumentLink" ADD COLUMN "organizationId" INTEGER;
UPDATE "DocumentLink" AS link
SET "organizationId" = document."organizationId"
FROM "Document" AS document
WHERE document."id" = link."documentId";
ALTER TABLE "DocumentLink" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "DocumentLink" DROP CONSTRAINT "DocumentLink_documentId_fkey";
DROP INDEX "DocumentLink_entityType_entityId_idx";
CREATE UNIQUE INDEX "Document_id_organizationId_key" ON "Document"("id", "organizationId");
CREATE INDEX "Document_organizationId_category_idx" ON "Document"("organizationId", "category");
CREATE INDEX "DocumentLink_organizationId_entityType_entityId_idx" ON "DocumentLink"("organizationId", "entityType", "entityId");
CREATE INDEX "DocumentLink_documentId_idx" ON "DocumentLink"("documentId");
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Project_id_organizationId_key" ON "Project"("id", "organizationId");

CREATE TABLE "IncomingInvoice" (
  "id" SERIAL NOT NULL,
  "organizationId" INTEGER NOT NULL,
  "supplierPartnerId" INTEGER NOT NULL,
  "projectId" INTEGER,
  "invoiceNumber" TEXT NOT NULL,
  "issueDate" DATE NOT NULL,
  "performanceDate" DATE,
  "dueDate" DATE,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'HUF',
  "netAmount" DECIMAL(18,2) NOT NULL,
  "vatAmount" DECIMAL(18,2) NOT NULL,
  "grossAmount" DECIMAL(18,2) NOT NULL,
  "status" "IncomingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "createdByMemberId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncomingInvoice_organizationId_supplierPartnerId_invoiceNum_key" ON "IncomingInvoice"("organizationId", "supplierPartnerId", "invoiceNumber");
CREATE UNIQUE INDEX "IncomingInvoice_id_organizationId_key" ON "IncomingInvoice"("id", "organizationId");
CREATE INDEX "IncomingInvoice_organizationId_idx" ON "IncomingInvoice"("organizationId");
CREATE INDEX "IncomingInvoice_organizationId_status_idx" ON "IncomingInvoice"("organizationId", "status");
CREATE INDEX "IncomingInvoice_organizationId_supplierPartnerId_idx" ON "IncomingInvoice"("organizationId", "supplierPartnerId");
CREATE INDEX "IncomingInvoice_organizationId_dueDate_idx" ON "IncomingInvoice"("organizationId", "dueDate");
CREATE INDEX "IncomingInvoice_projectId_organizationId_idx" ON "IncomingInvoice"("projectId", "organizationId");
CREATE INDEX "IncomingInvoice_createdByMemberId_organizationId_idx" ON "IncomingInvoice"("createdByMemberId", "organizationId");

ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_supplierPartnerId_organizationId_fkey" FOREIGN KEY ("supplierPartnerId", "organizationId") REFERENCES "Partner"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "OrganizationModule" ("organizationId", "module", "enabled", "createdAt", "updatedAt")
SELECT "id", 'INCOMING_INVOICES'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization"
ON CONFLICT ("organizationId", "module") DO NOTHING;

INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", permission."key", CURRENT_TIMESTAMP
FROM "OrganizationMember" AS member
CROSS JOIN (VALUES
  ('INCOMING_INVOICES_VIEW'::"PermissionKey"),
  ('INCOMING_INVOICES_CREATE'::"PermissionKey"),
  ('INCOMING_INVOICES_EDIT'::"PermissionKey"),
  ('INCOMING_INVOICES_DELETE'::"PermissionKey")
) AS permission("key")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
