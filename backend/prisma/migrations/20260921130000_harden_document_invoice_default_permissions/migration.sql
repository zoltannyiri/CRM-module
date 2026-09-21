-- Normalize legacy document category strings to canonical enum keys
UPDATE "Document" SET "category" = 'GENERAL' WHERE "category" = 'Általános';
UPDATE "Document" SET "category" = 'CONTRACT' WHERE "category" = 'Szerződés';
UPDATE "Document" SET "category" = 'PROJECT_FILE' WHERE "category" = 'Műszaki dokumentum';
UPDATE "Document" SET "category" = 'INVOICE' WHERE "category" = 'Pénzügyi dokumentum';
UPDATE "Document" SET "category" = 'OTHER' WHERE "category" = 'Egyéb';

-- Harden default permissions for USER role members:
-- Revoke blanket mutating permissions (CREATE, EDIT, DELETE) for Documents and Incoming Invoices.
-- USER retains view-only access (DOCUMENTS_VIEW, DOCUMENTS_DOWNLOAD, INCOMING_INVOICES_VIEW).
-- Mutating permissions can be granted explicitly to individual members by an Admin/Owner.
DELETE FROM "OrganizationMemberPermission"
WHERE "permission" IN (
    'DOCUMENTS_CREATE',
    'DOCUMENTS_EDIT',
    'DOCUMENTS_DELETE',
    'INCOMING_INVOICES_CREATE',
    'INCOMING_INVOICES_EDIT',
    'INCOMING_INVOICES_DELETE'
)
AND "organizationMemberId" IN (
    SELECT "id" FROM "OrganizationMember" WHERE "role" = 'USER'::"OrganizationRole"
);
