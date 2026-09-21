# Documents foundation

The `DOCUMENTS` module provides organization-scoped document metadata, private file storage and reusable links to business entities. Access is controlled by `DOCUMENTS_VIEW`, `DOCUMENTS_CREATE`, `DOCUMENTS_EDIT`, `DOCUMENTS_DELETE` and the existing `DOCUMENTS_DOWNLOAD` permission.

## Permissions & RBAC Matrix

Access control for Documents follows a hardened principle of least privilege:

| Operation / Permission | OWNER | ADMIN | USER (Default) | USER (Configurable) |
| :--- | :---: | :---: | :---: | :---: |
| `DOCUMENTS_VIEW` | Dynamic (Yes) | Yes | **Yes** | Yes |
| `DOCUMENTS_DOWNLOAD` | Dynamic (Yes) | Yes | **Yes** | Yes |
| `DOCUMENTS_CREATE` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |
| `DOCUMENTS_EDIT` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |
| `DOCUMENTS_DELETE` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |

- **OWNER**: Always has dynamic superuser access to all document capabilities without requiring explicit permission rows.
- **ADMIN**: Has all operational permissions by default, enabling complete document management, upload, link management, and deletion.
- **USER (Default)**: Initialized strictly with read and download capabilities (`DOCUMENTS_VIEW` and `DOCUMENTS_DOWNLOAD`). Standard users cannot upload new files, edit metadata, link/unlink entities, or delete documents unless explicitly granted by an organization Admin or Owner.
- **Admin Management**: Admins and Owners can toggle individual permissions for any `USER` role member via the Settings (`SettingsPermissionsPage`) UI.

## Model & Architecture

`Document` stores the display name, original filename, MIME type, byte size, opaque storage key, controlled `documentType`, optional description, uploader and timestamps. Supported types are `GENERAL`, `CONTRACT`, `INVOICE`, `RECEIPT`, `QUOTE`, `PROJECT_FILE` and `OTHER`. `DocumentLink` stores an explicit `organizationId` and can link a document to `PARTNER`, `PROJECT`, `OFFER` or `INCOMING_INVOICE`. The service verifies the target in the current organization and checks the target module's VIEW permission before creating a link. Duplicate links return HTTP 409.

The API exposes list, detail, create, metadata update, delete, authenticated download and link add/remove routes under `/api/documents`. Lists support search, document type and exact entity filters. Internal storage keys are removed from public responses.

Development files use the existing `storageService` under `backend/storage/documents`. Storage keys contain the organization ID and a UUID; user filenames never become paths. The storage root has traversal checks and is not served as a public static directory. Uploads are limited to 20 MB. Both MIME type and extension must match the allowlist for PDF, common images, Word, Excel, CSV and text files; executable/script extensions are rejected. Downloads re-check authentication, organization, module and permission, then stream with `Content-Type`, safe `Content-Disposition` and `Content-Length` headers.

Create saves the file first and removes it if the database transaction fails. Delete stages the physical file, deletes the database record and cascading links in a transaction, restores the file on database failure, then commits the physical deletion. Deleting an incoming invoice removes only its invoice links; it does not delete a document that may have other links.

The storage interface is isolated from business services so a later S3, R2, MinIO or Azure Blob adapter can replace local development storage. OCR, tags, versions, mail import, cloud adapters and full-text indexing are outside V1.
