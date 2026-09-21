import assert from "node:assert/strict";
import { once } from "node:events";
import { mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

let currentRole = "USER";
const granted = new Set();
const fakePrisma = {
  organizationMember: {
    findFirst: async () => ({
      id: 7,
      userId: 3,
      organizationId: 42,
      role: currentRole,
      organization: { id: 42, name: "Teszt" },
    }),
  },
  organizationModule: {
    findUnique: async ({ where }) => ({
      enabled: ["DOCUMENTS", "INCOMING_INVOICES"].includes(where.organizationId_module.module),
    }),
  },
  organizationMemberPermission: {
    findUnique: async ({ where }) => (granted.has(where.organizationMemberId_permission.permission) ? { id: 1 } : null),
  },
};

mock.module("../src/lib/prisma.js", { defaultExport: fakePrisma });

const [
  {
    DEFAULT_PERMISSIONS_BY_ROLE,
    DEFAULT_USER_PERMISSIONS,
    RESTRICTED_USER_PERMISSIONS,
    initializeMemberPermissions,
  },
  { default: documentRoutes },
  { default: invoiceRoutes },
] = await Promise.all([
  import("../src/services/permissionService.js"),
  import("../src/routes/documentRoutes.js"),
  import("../src/routes/incomingInvoiceRoutes.js"),
]);

test("permissionService defines hardened role defaults for Documents and Incoming Invoices", () => {
  const docInvoiceRestricted = [
    "DOCUMENTS_CREATE",
    "DOCUMENTS_EDIT",
    "DOCUMENTS_DELETE",
    "INCOMING_INVOICES_CREATE",
    "INCOMING_INVOICES_EDIT",
    "INCOMING_INVOICES_DELETE",
  ];

  for (const perm of docInvoiceRestricted) {
    assert.equal(RESTRICTED_USER_PERMISSIONS.has(perm), true, `${perm} should be restricted`);
  }

  for (const perm of docInvoiceRestricted) {
    assert.equal(DEFAULT_USER_PERMISSIONS.includes(perm), false, `${perm} must not be in default USER permissions`);
  }

  assert.equal(DEFAULT_USER_PERMISSIONS.includes("DOCUMENTS_VIEW"), true);
  assert.equal(DEFAULT_USER_PERMISSIONS.includes("DOCUMENTS_DOWNLOAD"), true);
  assert.equal(DEFAULT_USER_PERMISSIONS.includes("INCOMING_INVOICES_VIEW"), true);

  for (const perm of docInvoiceRestricted) {
    assert.equal(DEFAULT_PERMISSIONS_BY_ROLE.ADMIN.includes(perm), true);
    assert.equal(DEFAULT_PERMISSIONS_BY_ROLE.OWNER.includes(perm), true);
  }
});

test("initializeMemberPermissions respects hardened USER defaults and ADMIN full grants", async () => {
  const createdRecords = [];
  const fakeClient = {
    organizationMemberPermission: {
      createMany: async ({ data }) => {
        createdRecords.push(...data);
      },
    },
  };

  await initializeMemberPermissions(10, "USER", fakeClient);
  const userPerms = createdRecords.map((r) => r.permission);
  assert.equal(userPerms.includes("DOCUMENTS_VIEW"), true);
  assert.equal(userPerms.includes("DOCUMENTS_DOWNLOAD"), true);
  assert.equal(userPerms.includes("INCOMING_INVOICES_VIEW"), true);
  assert.equal(userPerms.includes("DOCUMENTS_CREATE"), false);
  assert.equal(userPerms.includes("DOCUMENTS_EDIT"), false);
  assert.equal(userPerms.includes("DOCUMENTS_DELETE"), false);
  assert.equal(userPerms.includes("INCOMING_INVOICES_CREATE"), false);
  assert.equal(userPerms.includes("INCOMING_INVOICES_EDIT"), false);
  assert.equal(userPerms.includes("INCOMING_INVOICES_DELETE"), false);

  createdRecords.length = 0;
  await initializeMemberPermissions(20, "ADMIN", fakeClient);
  const adminPerms = createdRecords.map((r) => r.permission);
  assert.equal(adminPerms.includes("DOCUMENTS_CREATE"), true);
  assert.equal(adminPerms.includes("INCOMING_INVOICES_CREATE"), true);

  createdRecords.length = 0;
  await initializeMemberPermissions(30, "OWNER", fakeClient);
  assert.equal(createdRecords.length, 0);
});

test("Documents and Incoming Invoice routes enforce their operation permissions", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "documents-invoices-permission-test-secret";
  currentRole = "USER";
  granted.clear();

  const app = express();
  app.use(express.json());
  app.use("/api/documents", documentRoutes);
  app.use("/api/incoming-invoices", invoiceRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const token = jwt.sign({ userId: 3 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const request = async (path, method) =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: ["POST", "PATCH"].includes(method) ? "{}" : undefined,
    });

  try {
    // 1. Without permissions, all routes return 403 PERMISSION_DENIED
    for (const [path, method, permission] of [
      ["/api/documents", "GET", "DOCUMENTS_VIEW"],
      ["/api/documents", "POST", "DOCUMENTS_CREATE"],
      ["/api/documents/1", "PATCH", "DOCUMENTS_EDIT"],
      ["/api/documents/1", "DELETE", "DOCUMENTS_DELETE"],
      ["/api/incoming-invoices", "GET", "INCOMING_INVOICES_VIEW"],
      ["/api/incoming-invoices", "POST", "INCOMING_INVOICES_CREATE"],
      ["/api/incoming-invoices/1", "PATCH", "INCOMING_INVOICES_EDIT"],
      ["/api/incoming-invoices/1", "DELETE", "INCOMING_INVOICES_DELETE"],
    ]) {
      granted.clear();
      const response = await request(path, method);
      const body = await response.json();
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(body.code, "PERMISSION_DENIED");
      assert.equal(body.permission, permission);
    }

    // 2. Default USER permissions (DOCUMENTS_VIEW, DOCUMENTS_DOWNLOAD, INCOMING_INVOICES_VIEW)
    // Mutating endpoints MUST still return 403 PERMISSION_DENIED
    granted.clear();
    granted.add("DOCUMENTS_VIEW");
    granted.add("DOCUMENTS_DOWNLOAD");
    granted.add("INCOMING_INVOICES_VIEW");

    for (const [path, method, permission] of [
      ["/api/documents", "POST", "DOCUMENTS_CREATE"],
      ["/api/documents/1", "PATCH", "DOCUMENTS_EDIT"],
      ["/api/documents/1", "DELETE", "DOCUMENTS_DELETE"],
      ["/api/incoming-invoices", "POST", "INCOMING_INVOICES_CREATE"],
      ["/api/incoming-invoices/1", "PATCH", "INCOMING_INVOICES_EDIT"],
      ["/api/incoming-invoices/1", "DELETE", "INCOMING_INVOICES_DELETE"],
    ]) {
      const response = await request(path, method);
      const body = await response.json();
      assert.equal(response.status, 403, `Default USER must be blocked on ${method} ${path}`);
      assert.equal(body.code, "PERMISSION_DENIED");
      assert.equal(body.permission, permission);
    }

    // 3. Explicit grant allows USER to perform mutating action (passes permission check)
    granted.add("DOCUMENTS_CREATE");
    const docCreateRes = await request("/api/documents", "POST");
    assert.notEqual(docCreateRes.status, 403, "Explicitly granted DOCUMENTS_CREATE must pass permission check");

    granted.add("INCOMING_INVOICES_CREATE");
    const invCreateRes = await request("/api/incoming-invoices", "POST");
    assert.notEqual(invCreateRes.status, 403, "Explicitly granted INCOMING_INVOICES_CREATE must pass permission check");

    // 4. OWNER bypasses permission checks even with empty granted set
    currentRole = "OWNER";
    granted.clear();
    const ownerDocRes = await request("/api/documents", "POST");
    assert.notEqual(ownerDocRes.status, 403, "OWNER must pass permission check on POST /api/documents");
    const ownerInvRes = await request("/api/incoming-invoices", "POST");
    assert.notEqual(ownerInvRes.status, 403, "OWNER must pass permission check on POST /api/incoming-invoices");
  } finally {
    server.close();
    await once(server, "close");
    process.env.JWT_SECRET = previousSecret;
  }
});
