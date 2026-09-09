CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "partnerId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX "Project_partnerId_idx" ON "Project"("partnerId");
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
