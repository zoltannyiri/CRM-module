-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('COMPANY', 'PERSON');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM (
  'PARTNERS',
  'PROJECTS',
  'TASKS',
  'DOCUMENTS',
  'QUOTES',
  'LEADS',
  'PIPELINE',
  'FOLLOW_UPS',
  'LOCATIONS',
  'DEVICES',
  'WORK_ORDERS',
  'MAINTENANCE'
);


-- =========================================================
-- ORGANIZATION
-- =========================================================

-- Add slug nullable first because organizations already exist
ALTER TABLE "Organization"
ADD COLUMN "slug" TEXT;

-- Give every existing organization a deterministic unique slug
UPDATE "Organization"
SET "slug" = 'organization-' || "id"
WHERE "slug" IS NULL;

-- Now it is safe to make it required
ALTER TABLE "Organization"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Organization_slug_key"
ON "Organization"("slug");


-- =========================================================
-- ORGANIZATION MEMBERS
-- =========================================================

CREATE TABLE "OrganizationMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- Preserve existing User -> Organization membership.
--
-- Existing ADMIN users were effectively the highest level users
-- in the old schema, therefore migrate them to OWNER.
INSERT INTO "OrganizationMember" (
    "userId",
    "organizationId",
    "role",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "organizationId",
    CASE
        WHEN "role"::text = 'ADMIN'
            THEN 'OWNER'::"OrganizationRole"
        ELSE 'USER'::"OrganizationRole"
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

CREATE INDEX "OrganizationMember_organizationId_idx"
ON "OrganizationMember"("organizationId");

CREATE INDEX "OrganizationMember_userId_idx"
ON "OrganizationMember"("userId");

CREATE UNIQUE INDEX "OrganizationMember_userId_organizationId_key"
ON "OrganizationMember"("userId", "organizationId");

ALTER TABLE "OrganizationMember"
ADD CONSTRAINT "OrganizationMember_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember"
ADD CONSTRAINT "OrganizationMember_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- =========================================================
-- INVITATION ROLE MIGRATION
-- =========================================================

-- Preserve existing ADMIN / USER invitation roles instead
-- of dropping the column and losing its values.
ALTER TABLE "Invitation"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "Invitation"
ALTER COLUMN "role"
TYPE "OrganizationRole"
USING ("role"::text::"OrganizationRole");

ALTER TABLE "Invitation"
ALTER COLUMN "role"
SET DEFAULT 'USER';


-- =========================================================
-- COMPANY -> PARTNER
-- =========================================================

-- Preserve all existing companies by renaming the table
-- instead of dropping and recreating it.

ALTER TABLE "Contact"
DROP CONSTRAINT "Contact_companyId_fkey";

ALTER TABLE "Company"
DROP CONSTRAINT "Company_organizationId_fkey";

ALTER TABLE "Company"
RENAME TO "Partner";

-- Add the new discriminator.
-- Every old Company is naturally a COMPANY Partner.
ALTER TABLE "Partner"
ADD COLUMN "type" "PartnerType" NOT NULL DEFAULT 'COMPANY';

-- Rename Contact foreign key column and preserve all values.
ALTER TABLE "Contact"
RENAME COLUMN "companyId" TO "partnerId";


-- =========================================================
-- PARTNER INDEXES / RELATIONS
-- =========================================================

CREATE INDEX "Partner_organizationId_idx"
ON "Partner"("organizationId");

CREATE INDEX "Partner_organizationId_name_idx"
ON "Partner"("organizationId", "name");

CREATE INDEX "Contact_partnerId_idx"
ON "Contact"("partnerId");

ALTER TABLE "Partner"
ADD CONSTRAINT "Partner_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_partnerId_fkey"
FOREIGN KEY ("partnerId")
REFERENCES "Partner"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- =========================================================
-- ORGANIZATION MODULES
-- =========================================================

CREATE TABLE "OrganizationModule" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "module" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationModule_organizationId_idx"
ON "OrganizationModule"("organizationId");

CREATE UNIQUE INDEX "OrganizationModule_organizationId_module_key"
ON "OrganizationModule"("organizationId", "module");

ALTER TABLE "OrganizationModule"
ADD CONSTRAINT "OrganizationModule_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Existing organizations predate the module system.
-- Enable PARTNERS for them so they do not end up with an empty setup.
INSERT INTO "OrganizationModule" (
    "organizationId",
    "module",
    "enabled",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    'PARTNERS'::"ModuleKey",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization";


-- =========================================================
-- SESSION
-- =========================================================

ALTER TABLE "Session"
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "Session_userId_idx"
ON "Session"("userId");


-- =========================================================
-- INVITATION INDEX
-- =========================================================

CREATE INDEX "Invitation_organizationId_idx"
ON "Invitation"("organizationId");


-- =========================================================
-- REMOVE OLD USER TENANT FIELDS
-- =========================================================

-- Membership data has already been copied above,
-- so these columns can now safely be removed.

ALTER TABLE "User"
DROP CONSTRAINT "User_organizationId_fkey";

ALTER TABLE "User"
DROP COLUMN "organizationId",
DROP COLUMN "role";


-- Old enum is no longer used.
DROP TYPE "UserRole";