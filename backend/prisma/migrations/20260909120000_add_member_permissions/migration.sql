CREATE TYPE "PermissionKey" AS ENUM (
  'PARTNERS_VIEW',
  'PARTNERS_CREATE',
  'PARTNERS_EDIT',
  'PARTNERS_DELETE',
  'PROJECTS_VIEW',
  'PROJECTS_CREATE',
  'PROJECTS_EDIT',
  'PROJECTS_DELETE',
  'TASKS_VIEW',
  'TASKS_CREATE',
  'TASKS_EDIT',
  'TASKS_DELETE',
  'TASKS_ASSIGN',
  'ACTIVITY_VIEW'
);

CREATE TABLE "OrganizationMemberPermission" (
    "id" SERIAL NOT NULL,
    "organizationMemberId" INTEGER NOT NULL,
    "permission" "PermissionKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMemberPermission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationMemberPermission_organizationMemberId_idx"
ON "OrganizationMemberPermission"("organizationMemberId");

CREATE UNIQUE INDEX "OrganizationMemberPermission_organizationMemberId_permission_key"
ON "OrganizationMemberPermission"("organizationMemberId", "permission");

ALTER TABLE "OrganizationMemberPermission"
ADD CONSTRAINT "OrganizationMemberPermission_organizationMemberId_fkey"
FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the effective access of existing non-owner members.
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
      ('PARTNERS_VIEW'::"PermissionKey"),
      ('PARTNERS_CREATE'::"PermissionKey"),
      ('PARTNERS_EDIT'::"PermissionKey"),
      ('PARTNERS_DELETE'::"PermissionKey"),
      ('PROJECTS_VIEW'::"PermissionKey"),
      ('PROJECTS_CREATE'::"PermissionKey"),
      ('PROJECTS_EDIT'::"PermissionKey"),
      ('PROJECTS_DELETE'::"PermissionKey"),
      ('TASKS_VIEW'::"PermissionKey"),
      ('TASKS_CREATE'::"PermissionKey"),
      ('TASKS_EDIT'::"PermissionKey"),
      ('TASKS_DELETE'::"PermissionKey"),
      ('TASKS_ASSIGN'::"PermissionKey"),
      ('ACTIVITY_VIEW'::"PermissionKey")
) AS permissions("permission")
WHERE member."role" IN ('ADMIN'::"OrganizationRole", 'USER'::"OrganizationRole")
ON CONFLICT ("organizationMemberId", "permission") DO NOTHING;
