-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('PARTNER', 'PROJECT');

-- AlterEnum
ALTER TYPE "ActivityEntityType" ADD VALUE 'DOCUMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionKey" ADD VALUE 'DOCUMENTS_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'DOCUMENTS_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'DOCUMENTS_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'DOCUMENTS_DELETE';
ALTER TYPE "PermissionKey" ADD VALUE 'DOCUMENTS_DOWNLOAD';

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "uploadedByMemberId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "Document_uploadedByMemberId_idx" ON "Document"("uploadedByMemberId");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE INDEX "DocumentLink_entityType_entityId_idx" ON "DocumentLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_documentId_entityType_entityId_key" ON "DocumentLink"("documentId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByMemberId_fkey" FOREIGN KEY ("uploadedByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OrganizationMemberPermission_organizationMemberId_permission_ke" RENAME TO "OrganizationMemberPermission_organizationMemberId_permissio_key";

-- Backfill DOCUMENTS module for existing organizations
INSERT INTO "OrganizationModule" (
    "organizationId",
    "module",
    "enabled",
    "createdAt",
    "updatedAt"
)
SELECT
    organization."id",
    'DOCUMENTS'::"ModuleKey",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" AS organization
ON CONFLICT ("organizationId", "module") DO NOTHING;

-- Backfill DOCUMENTS permissions for existing members
INSERT INTO "OrganizationMemberPermission" (
    "organizationMemberId",
    "permission",
    "createdAt"
)
SELECT
    member."id",
    permissions."permission",
    CURRENT_TIMESTAMP
FROM "OrganizationMember" AS member
CROSS JOIN (
    VALUES
      ('DOCUMENTS_VIEW'::"PermissionKey"),
      ('DOCUMENTS_CREATE'::"PermissionKey"),
      ('DOCUMENTS_EDIT'::"PermissionKey"),
      ('DOCUMENTS_DELETE'::"PermissionKey"),
      ('DOCUMENTS_DOWNLOAD'::"PermissionKey")
) AS permissions("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;

