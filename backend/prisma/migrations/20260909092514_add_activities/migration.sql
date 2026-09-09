-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('PARTNER', 'CONTACT', 'PROJECT', 'TASK');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ASSIGNED', 'PRIORITY_CHANGED');

-- CreateTable
CREATE TABLE "Activity" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "actorMemberId" INTEGER,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_organizationId_idx" ON "Activity"("organizationId");

-- CreateIndex
CREATE INDEX "Activity_organizationId_entityType_entityId_idx" ON "Activity"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Activity_actorMemberId_idx" ON "Activity"("actorMemberId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
