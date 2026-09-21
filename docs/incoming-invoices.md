# Incoming invoices V1

The `INCOMING_INVOICES` module records incoming supplier invoices and cost documents. Routes and UI require `INCOMING_INVOICES_VIEW`, `INCOMING_INVOICES_CREATE`, `INCOMING_INVOICES_EDIT` or `INCOMING_INVOICES_DELETE` as appropriate. Status changes use EDIT because this project has no separate approval-action permission pattern.

## Permissions & RBAC Matrix

Because incoming invoices represent financial and cost commitments, access control follows strict financial segregation of duties:

| Operation / Permission | OWNER | ADMIN | USER (Default) | USER (Configurable) |
| :--- | :---: | :---: | :---: | :---: |
| `INCOMING_INVOICES_VIEW` | Dynamic (Yes) | Yes | **Yes** | Yes |
| `INCOMING_INVOICES_CREATE` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |
| `INCOMING_INVOICES_EDIT` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |
| `INCOMING_INVOICES_DELETE` | Dynamic (Yes) | Yes | **No** | Grantable by Admin/Owner |

- **OWNER**: Holds dynamic superuser access to all invoice and financial actions.
- **ADMIN**: Holds full operational CRUD by default (`INCOMING_INVOICES_VIEW`, `INCOMING_INVOICES_CREATE`, `INCOMING_INVOICES_EDIT`, `INCOMING_INVOICES_DELETE`), enabling complete invoice lifecycle and status flow management.
- **USER (Default)**: Initialized strictly with read-only access (`INCOMING_INVOICES_VIEW`). Standard users can view invoices and inspect amounts, but cannot create invoices, advance approval statuses, edit financial totals, or delete records.
- **Configurable Delegation**: Admins and Owners can delegate invoice creation, editing, or deletion to specific trusted members via the Settings (`SettingsPermissionsPage`) screen.

## Model & Validation

`IncomingInvoice` belongs to an organization and a required supplier `Partner`; it may reference one `Project`. Services validate both relations with the current organization and require permission to view the related module. The model stores an organization-scoped invoice number, issue/performance/due dates, currency, totals, status, note, creator and timestamps. The database uniqueness constraint is `(organizationId, supplierPartnerId, invoiceNumber)`; conflicts return HTTP 409 with `INVOICE_ALREADY_EXISTS`.

Currencies are restricted to HUF, EUR and USD. Net, VAT and gross values use PostgreSQL `numeric(18,2)` through Prisma `Decimal`, must be non-negative, and require exact `net + vat = gross` equality after the two-decimal input validation. No floating-point arithmetic is used in backend validation.

Statuses are `DRAFT`, `RECEIVED`, `APPROVED`, `PAID` and `REJECTED`. New records start as DRAFT. Allowed transitions are DRAFT → RECEIVED, RECEIVED → APPROVED or REJECTED, and APPROVED → PAID. Arbitrary jumps are rejected by the service.

The `/api/incoming-invoices` API supports CRUD, tenant-scoped detail and list filters for supplier, project, status, currency, issue/due date ranges and invoice/supplier search. Sorting is allowlisted to creation date, issue date, due date and gross amount. Detail responses include permitted supplier/project summaries, creator data and documents linked through the common Documents foundation.

The frontend adds a permission-gated sidebar page, the existing table/badge style, a half-screen form drawer, canonical detail tabs and Partner/Project related lists. A reusable upload field can attach a first document during create/edit. If metadata is saved but upload fails, the form keeps the saved invoice ID and reports the partial failure so the upload can be retried without creating a duplicate invoice.

Activity uses the shared activity service for creation, updates, status changes and document attach/remove events. V1 contains invoice headers only: it has no line items, cost allocation, OCR, NAV/vendor integrations, bank matching, exchange rates, outgoing invoices, ledger, VAT reporting or multi-level approval workflow.
