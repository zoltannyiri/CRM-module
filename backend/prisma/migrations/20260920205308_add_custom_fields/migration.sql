-- CreateEnum
CREATE TYPE "CustomFieldEntityType" AS ENUM ('LEAD', 'PARTNER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'MONEY', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionKey" ADD VALUE 'CUSTOM_FIELDS_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'CUSTOM_FIELDS_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'CUSTOM_FIELDS_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'CUSTOM_FIELDS_DELETE';

-- CreateTable
CREATE TABLE "CustomField" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "helpText" TEXT,
    "defaultValue" TEXT,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "customFieldId" INTEGER NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "entityId" INTEGER NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomField_organizationId_entityType_active_idx" ON "CustomField"("organizationId", "entityType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_organizationId_entityType_key_key" ON "CustomField"("organizationId", "entityType", "key");

-- CreateIndex
CREATE INDEX "CustomFieldValue_organizationId_entityType_entityId_idx" ON "CustomFieldValue"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_customFieldId_idx" ON "CustomFieldValue"("customFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_customFieldId_entityId_key" ON "CustomFieldValue"("customFieldId", "entityId");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
