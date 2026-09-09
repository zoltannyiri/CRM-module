-- Preserve access for organizations created before module gating became active.
-- Existing disabled records stay disabled; only missing defaults are inserted.
INSERT INTO "OrganizationModule" (
    "organizationId",
    "module",
    "enabled",
    "createdAt",
    "updatedAt"
)
SELECT
    organization."id",
    defaults."module",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" AS organization
CROSS JOIN (
    VALUES
        ('PARTNERS'::"ModuleKey"),
        ('PROJECTS'::"ModuleKey"),
        ('TASKS'::"ModuleKey")
) AS defaults("module")
ON CONFLICT ("organizationId", "module") DO NOTHING;
