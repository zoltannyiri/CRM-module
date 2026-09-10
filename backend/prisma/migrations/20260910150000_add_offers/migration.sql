-- Rename the previously reserved module key to the final Offers module name.
ALTER TYPE "ModuleKey" RENAME VALUE 'QUOTES' TO 'OFFERS';

-- Extend permissions and activities.
ALTER TYPE "PermissionKey" ADD VALUE 'OFFERS_VIEW';
ALTER TYPE "PermissionKey" ADD VALUE 'OFFERS_CREATE';
ALTER TYPE "PermissionKey" ADD VALUE 'OFFERS_EDIT';
ALTER TYPE "PermissionKey" ADD VALUE 'OFFERS_DELETE';
ALTER TYPE "ActivityEntityType" ADD VALUE 'OFFER';

CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "OfferSequence" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Offer" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "offerNumber" TEXT NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'HUF',
    "note" TEXT,
    "createdByMemberId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfferItem" (
    "id" SERIAL NOT NULL,
    "offerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferSequence_organizationId_year_key" ON "OfferSequence"("organizationId", "year");
CREATE INDEX "OfferSequence_organizationId_idx" ON "OfferSequence"("organizationId");
CREATE UNIQUE INDEX "Offer_organizationId_offerNumber_key" ON "Offer"("organizationId", "offerNumber");
CREATE INDEX "Offer_organizationId_idx" ON "Offer"("organizationId");
CREATE INDEX "Offer_partnerId_idx" ON "Offer"("partnerId");
CREATE INDEX "Offer_projectId_idx" ON "Offer"("projectId");
CREATE INDEX "Offer_organizationId_status_idx" ON "Offer"("organizationId", "status");
CREATE INDEX "Offer_createdByMemberId_idx" ON "Offer"("createdByMemberId");
CREATE INDEX "OfferItem_offerId_position_idx" ON "OfferItem"("offerId", "position");

ALTER TABLE "OfferSequence" ADD CONSTRAINT "OfferSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OrganizationModule" ("organizationId", "module", "enabled", "createdAt", "updatedAt")
SELECT "id", 'OFFERS'::"ModuleKey", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "module") DO NOTHING;

INSERT INTO "OrganizationMemberPermission" ("organizationMemberId", "permission", "createdAt")
SELECT member."id", permission."permission", CURRENT_TIMESTAMP
FROM "OrganizationMember" AS member
CROSS JOIN (
  VALUES
    ('OFFERS_VIEW'::"PermissionKey"),
    ('OFFERS_CREATE'::"PermissionKey"),
    ('OFFERS_EDIT'::"PermissionKey"),
    ('OFFERS_DELETE'::"PermissionKey")
) AS permission("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
