import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

import storageService from "../src/services/storageService.js";
import {
  getDocuments,
  getDocumentById,
  getDocumentForDownload,
  createDocument,
  updateDocument,
  deleteDocument,
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
  assert.deepEqual(docs[0].partner, { id: 101, name: "Acme Corp" });
  assert.equal(docs[0].project, null, "Project name must not leak without PROJECTS_VIEW");

  // Query entityType=PROJECT without PROJECTS_VIEW -> returns [] without DB query
  const projectDocs = await getDocuments(
    { organizationId: 42, membership, entityType: "PROJECT", entityId: 202 },
    fakeClient,
  );
  assert.deepEqual(projectDocs, []);
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
