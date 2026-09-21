import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

import storageService from "../src/services/storageService.js";
import { getDocuments as getDocumentsController } from "../src/controllers/documentController.js";
import {
  getDocuments,
  getDocumentById,
  getDocumentForDownload,
  createDocument,
  updateDocument,
  deleteDocument,
  addDocumentLink,
  removeDocumentLink,
} from "../src/services/documentService.js";

test("storageService saves, retrieves and deletes files safely", async () => {
  const testBuffer = Buffer.from("Hello Document Storage Test!");
  const saved = await storageService.saveFile({
    organizationId: 999,
    buffer: testBuffer,
    originalFileName: "test-report.pdf",
  });

  assert.ok(saved.storageKey.startsWith("999/"));
  assert.ok(saved.storageKey.endsWith(".pdf"));
  assert.equal(saved.size, testBuffer.length);

  const retrieved = await storageService.getFile({ storageKey: saved.storageKey });
  assert.ok(retrieved);
  assert.equal(retrieved.size, testBuffer.length);

  await storageService.deleteFile({ storageKey: saved.storageKey });
  const afterDelete = await storageService.getFile({ storageKey: saved.storageKey });
  assert.equal(afterDelete, null);
});

test("documentService getDocuments enforces tenant and entity view permissions", async () => {
  const calls = [];
  const fakeClient = {
    document: {
      findMany: async (args) => {
        calls.push(["document.findMany", args]);
        return [
          {
            id: 1,
            organizationId: 42,
            name: "Szerződés",
            originalFileName: "szerzodes.pdf",
            mimeType: "application/pdf",
            size: 1024,
            storageKey: "42/secret-key.pdf",
            category: "Szerződés",
            uploadedByMember: { id: 5, user: { firstName: "Elek", lastName: "Teszt" } },
            links: [
              { entityType: "PARTNER", entityId: 101 },
              { entityType: "PROJECT", entityId: 202 },
            ],
          },
        ];
      },
    },
    partner: {
      findMany: async () => [{ id: 101, name: "Acme Corp" }],
    },
    project: {
      findMany: async () => [{ id: 202, name: "Webshop Fejlesztés" }],
    },
    organizationModule: {
      findMany: async () => [{ module: "PARTNERS" }, { module: "PROJECTS" }, { module: "DOCUMENTS" }],
    },
    organizationMemberPermission: {
      findMany: async () => [
        { permission: "DOCUMENTS_VIEW" },
        { permission: "PARTNERS_VIEW" },
        // Notice PROJECTS_VIEW is NOT present
      ],
    },
  };

  const membership = { id: 5, role: "USER" };

  // Query general list: partner is attached, project is NOT attached (because no PROJECTS_VIEW)
  const docs = await getDocuments({ organizationId: 42, membership }, fakeClient);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, "Szerződés");
  assert.equal(docs[0].storageKey, undefined, "storageKey should never leak to frontend");
  assert.equal(docs[0].links, undefined, "raw entity link identifiers should never leak to frontend");
  assert.deepEqual(docs[0].partner, { id: 101, name: "Acme Corp" });
  assert.equal(docs[0].project, null, "Project name must not leak without PROJECTS_VIEW");

  // Query entityType=PROJECT without PROJECTS_VIEW -> returns [] without DB query
  const projectDocs = await getDocuments(
    { organizationId: 42, membership, entityType: "PROJECT", entityId: 202 },
    fakeClient,
  );
  assert.deepEqual(projectDocs, []);
});

test("storageService rejects traversal and can roll staged deletions back", async () => {
  await assert.rejects(
    storageService.getFile({ storageKey: "../outside-document.pdf" }),
    /Érvénytelen tárolási azonosító/,
  );

  const saved = await storageService.saveFile({
    organizationId: 999,
    buffer: Buffer.from("staged delete"),
    originalFileName: "staged.txt",
  });

  const staged = await storageService.stageFileDeletion({ storageKey: saved.storageKey });
  assert.equal(staged.existed, true);
  assert.equal(await storageService.getFile({ storageKey: saved.storageKey }), null);

  await staged.rollback();
  assert.ok(await storageService.getFile({ storageKey: saved.storageKey }));
  await storageService.deleteFile({ storageKey: saved.storageKey });
});

test("documentService update changes only the explicitly supplied link type", async () => {
  const deletedLinks = [];
  const createdLinks = [];
  const fakeClient = {
    $transaction: async (callback) => callback(fakeClient),
    organizationModule: {
      findMany: async () => [{ module: "PARTNERS" }, { module: "PROJECTS" }, { module: "DOCUMENTS" }],
    },
    organizationMemberPermission: {
      findMany: async () => [{ permission: "PARTNERS_VIEW" }, { permission: "PROJECTS_VIEW" }],
    },
    partner: {
      findFirst: async ({ where }) => where.organizationId === 42 && where.id === 55 ? { id: 55 } : null,
    },
    project: {
      findFirst: async () => ({ id: 77 }),
    },
    document: {
      update: async ({ data }) => ({ id: 1, name: data.name || "Régi név" }),
      findFirst: async ({ include }) => include?.uploadedByMember ? ({
        id: 1,
        organizationId: 42,
        name: "Új név",
        storageKey: "42/private.pdf",
        links: [
          { entityType: "PARTNER", entityId: 55 },
          { entityType: "PROJECT", entityId: 77 },
        ],
      }) : ({
        id: 1,
        organizationId: 42,
        name: "Régi név",
        links: [
          { entityType: "PARTNER", entityId: 44 },
          { entityType: "PROJECT", entityId: 77 },
        ],
      }),
    },
    documentLink: {
      deleteMany: async ({ where }) => { deletedLinks.push(where); },
      create: async ({ data }) => { createdLinks.push(data); },
    },
    activity: { create: async () => ({ id: 10 }) },
  };

  const updated = await updateDocument({
    organizationId: 42,
    actorMemberId: 5,
    membership: { id: 5, role: "USER" },
    documentId: 1,
    data: { name: "Új név", partnerId: 55 },
  }, fakeClient);

  assert.deepEqual(deletedLinks, [{ documentId: 1, entityType: "PARTNER", document: { organizationId: 42 } }]);
  assert.deepEqual(createdLinks, [{ documentId: 1, organizationId: 42, entityType: "PARTNER", entityId: 55 }]);
  assert.equal(updated.storageKey, undefined);
  assert.equal(updated.links, undefined);
});

test("documentService delete restores the binary when the database transaction fails", async () => {
  const saved = await storageService.saveFile({
    organizationId: 999,
    buffer: Buffer.from("rollback delete"),
    originalFileName: "rollback.pdf",
  });
  const fakeClient = {
    document: {
      findFirst: async ({ where }) => where.organizationId === 999
        ? { id: 3, name: "Rollback", storageKey: saved.storageKey }
        : null,
    },
    $transaction: async () => { throw new Error("database unavailable"); },
  };

  await assert.rejects(
    deleteDocument({ organizationId: 999, actorMemberId: 5, documentId: 3 }, fakeClient),
    /database unavailable/,
  );
  assert.ok(await storageService.getFile({ storageKey: saved.storageKey }));
  await storageService.deleteFile({ storageKey: saved.storageKey });
});

test("documentService getDocumentForDownload enforces tenant isolation", async () => {
  const fakeClient = {
    document: {
      findFirst: async ({ where }) => {
        if (where.organizationId === 42 && where.id === 1) {
          return {
            id: 1,
            organizationId: 42,
            originalFileName: "ajanlat.pdf",
            mimeType: "application/pdf",
            size: 2048,
            storageKey: "42/uuid.pdf",
          };
        }
        return null;
      },
    },
  };

  // Valid tenant:
  const allowed = await getDocumentForDownload({ organizationId: 42, documentId: 1 }, fakeClient);
  assert.ok(allowed);
  assert.equal(allowed.originalFileName, "ajanlat.pdf");

  // Other tenant trying to access:
  const denied = await getDocumentForDownload({ organizationId: 99, documentId: 1 }, fakeClient);
  assert.equal(denied, null);
});

test("DocumentLink validates tenant targets, supports Partner/Project/Invoice and rejects duplicates", async () => {
  const links = [];
  const fakeClient = {
    $transaction: async (callback) => callback(fakeClient),
    organizationModule: { findMany: async () => ["DOCUMENTS", "PARTNERS", "PROJECTS", "INCOMING_INVOICES"].map((module) => ({ module })) },
    organizationMemberPermission: { findMany: async () => ["PARTNERS_VIEW", "PROJECTS_VIEW", "INCOMING_INVOICES_VIEW"].map((permission) => ({ permission })) },
    document: { findFirst: async ({ where }) => where.organizationId === 42 ? { id: 1, name: "Bizonylat" } : null },
    partner: { findFirst: async ({ where }) => where.organizationId === 42 && where.id === 10 ? { id: 10 } : null },
    project: { findFirst: async ({ where }) => where.organizationId === 42 && where.id === 20 ? { id: 20 } : null },
    incomingInvoice: { findFirst: async ({ where }) => where.organizationId === 42 && where.id === 30 ? { id: 30 } : null },
    documentLink: {
      findFirst: async ({ where }) => links.find((link) => link.organizationId === where.organizationId && link.documentId === where.documentId && link.entityType === where.entityType && link.entityId === where.entityId) || null,
      create: async ({ data }) => { const link = { id: links.length + 1, ...data }; links.push(link); return link; },
    },
    activity: { create: async ({ data }) => data },
  };
  const args = { organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, documentId: 1 };
  await addDocumentLink({ ...args, entityType: "PARTNER", entityId: 10 }, fakeClient);
  await addDocumentLink({ ...args, entityType: "PROJECT", entityId: 20 }, fakeClient);
  await addDocumentLink({ ...args, entityType: "INCOMING_INVOICE", entityId: 30 }, fakeClient);
  assert.deepEqual(links.map(({ entityType }) => entityType), ["PARTNER", "PROJECT", "INCOMING_INVOICE"]);
  await assert.rejects(addDocumentLink({ ...args, entityType: "PARTNER", entityId: 10 }, fakeClient), (error) => error.statusCode === 409);
  await assert.rejects(addDocumentLink({ ...args, entityType: "PARTNER", entityId: 999 }, fakeClient), (error) => error.statusCode === 404);
  assert.equal(await addDocumentLink({ ...args, organizationId: 99, entityType: "PARTNER", entityId: 10 }, fakeClient), null);
});

test("DocumentLink removal is organization scoped and records cleanup", async () => {
  let removed = false; const activities = [];
  const fakeClient = {
    $transaction: async (callback) => callback(fakeClient),
    documentLink: { findFirst: async ({ where }) => where.organizationId === 42 ? { id: 8, documentId: 1, organizationId: 42, entityType: "INCOMING_INVOICE", entityId: 30, document: { name: "Bizonylat" } } : null, delete: async () => { removed = true; } },
    activity: { create: async ({ data }) => { activities.push(data); return data; } },
  };
  assert.equal(await removeDocumentLink({ organizationId: 99, actorMemberId: 5, documentId: 1, linkId: 8 }, fakeClient), false);
  assert.equal(removed, false);
  assert.equal(await removeDocumentLink({ organizationId: 42, actorMemberId: 5, documentId: 1, linkId: 8 }, fakeClient), true);
  assert.equal(activities[0].action, "DOCUMENT_REMOVED");
});

test("document controller rejects incomplete or invalid entity filters", async () => {
  const execute = async (query) => {
    const result = { statusCode: 200, body: null };
    const response = {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; },
    };
    await getDocumentsController(
      { query, organization: { id: 42 }, membership: { id: 5 } },
      response,
      (error) => { throw error; },
    );
    return result;
  };

  assert.equal((await execute({ entityType: "UNKNOWN", entityId: "1" })).statusCode, 400);
  assert.equal((await execute({ entityType: "PARTNER", entityId: "abc" })).statusCode, 400);
  assert.equal((await execute({ entityId: "1" })).statusCode, 400);
});
