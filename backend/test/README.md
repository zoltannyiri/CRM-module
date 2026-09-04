# Auth regression checks

Tested with Node.js 24.13.1, module mocking enabled, and installed backend dependencies.

`npm test` runs the token test. Database integration tests are skipped unless explicitly enabled.

To run the HTTP integration suite in PowerShell from `backend`, with `DATABASE_URL`
pointing to a PostgreSQL database matching `prisma/schema.prisma`:

```powershell
$env:AUTH_DB_TESTS = '1'
npm test
Remove-Item Env:AUTH_DB_TESTS
```

The suite exercises the real Express routes, middleware and Prisma SQL. Its Prisma
import is redirected to one outer transaction; nested service transactions use
savepoints. All fixture rows are rolled back and rollback is checked. PostgreSQL
sequences can advance. Use a test database for repeatable runs. Concurrent requests
on separate database connections are not simulated by this harness.

Coverage: login and `/me`; OWNER/ADMIN/USER permissions; missing membership and
malformed JWT identity; invitation creation/validation/registration, expiration,
email binding and reuse rejection; tenant-scoped partner CRUD and mass assignment;
refresh rotation, replay, expiry and logout; new and existing admin bootstrap.

The MVP default organization is the membership with the lowest ID. Login and
authenticated requests use the same selection. Roles are read from the database
on every organization-protected request. JWT application data contains only `userId`
(plus the standard `iat` and `exp` timestamps).

For an invitation admin-403, inspect the requesting user's first
`OrganizationMember.role`; only OWNER and ADMIN pass. If the database role is
correct, verify the token identifies the intended user and the running backend
uses this checkout and database. The checked-in invitation middleware chain was
already membership-based before these changes.

`npm run admin:create` requires `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It creates or
updates the user and an OWNER membership transactionally. By default it reuses the
user's oldest membership, or creates an organization with a unique slug when none
exists. `ADMIN_ORGANIZATION_SLUG` can explicitly target an organization (created
if missing). This does not change the default organization selection for users who
already have an older membership. Running bootstrap resets that user's password.
