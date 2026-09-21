import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { normalizeIncomingInvoicePayload } from "../src/validation/incomingInvoiceValidation.js";
import { createIncomingInvoice, deleteIncomingInvoice, getIncomingInvoiceById, updateIncomingInvoice } from "../src/services/incomingInvoiceService.js";

const basePayload = { supplierPartnerId: 10, projectId: 20, invoiceNumber: "INV-1", issueDate: "2026-09-21", performanceDate: null, dueDate: "2026-10-01", currency: "HUF", netAmount: "100.10", vatAmount: "27.03", grossAmount: "127.13", status: "DRAFT", note: null };

test("incoming invoice payload validates dates, currency, non-negative decimals and exact totals", () => {
  const valid = normalizeIncomingInvoicePayload(basePayload);
  assert.ok(valid.data.issueDate instanceof Date);
  assert.equal(valid.data.grossAmount.toString(), "127.13");
  for (const invalid of [
    { ...basePayload, issueDate: "2026-02-30" }, { ...basePayload, currency: "GBP" },
    { ...basePayload, netAmount: "-1" }, { ...basePayload, grossAmount: "127.12" },
    { ...basePayload, supplierPartnerId: true }, { ...basePayload, status: "PAID" },
  ]) assert.ok(normalizeIncomingInvoicePayload(invalid).error);
});

const record = (overrides = {}) => ({ id: 1, supplierPartnerId: 10, projectId: 20, invoiceNumber: "INV-1", issueDate: new Date("2026-09-21Z"), performanceDate: null, dueDate: null, currency: "HUF", netAmount: new Prisma.Decimal("100.10"), vatAmount: new Prisma.Decimal("27.03"), grossAmount: new Prisma.Decimal("127.13"), status: "DRAFT", note: null, createdAt: new Date(), updatedAt: new Date(), createdByMember: null, ...overrides });

function client({ partner = true, project = true } = {}) {
  const value = {
    organizationModule: { findMany: async () => [{ module: "PARTNERS" }, { module: "PROJECTS" }, { module: "DOCUMENTS" }, { module: "INCOMING_INVOICES" }] },
    organizationMemberPermission: { findMany: async () => ["PARTNERS_VIEW", "PROJECTS_VIEW", "DOCUMENTS_VIEW"].map((permission) => ({ permission })) },
    partner: { findFirst: async ({ where }) => partner && where.organizationId === 42 && where.id === 10 ? { id: 10 } : null, findMany: async () => [{ id: 10, name: "Szállító Kft." }] },
    project: { findFirst: async ({ where }) => project && where.organizationId === 42 && where.id === 20 ? { id: 20 } : null, findMany: async () => [{ id: 20, name: "Projekt" }] },
    document: { findMany: async () => [] }, activity: { create: async ({ data }) => data }, documentLink: { deleteMany: async () => ({ count: 0 }) },
  };
  value.$transaction = async (callback) => callback(value);
  return value;
}

test("incoming invoice create validates tenant relations, writes activity and maps duplicate to 409", async () => {
  const data = normalizeIncomingInvoicePayload(basePayload).data;
  const foreign = client({ partner: false }); foreign.incomingInvoice = { create: async () => record() };
  await assert.rejects(createIncomingInvoice({ organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, data }, foreign), (error) => error.statusCode === 404);
  const duplicate = client(); duplicate.incomingInvoice = { create: async () => { const error = new Error("unique"); error.code = "P2002"; throw error; } };
  await assert.rejects(createIncomingInvoice({ organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, data }, duplicate), (error) => error.statusCode === 409 && error.code === "INVOICE_ALREADY_EXISTS");
});

test("incoming invoice status transitions are allowlisted and tenant mutations are scoped", async () => {
  const c = client(); let changed = false;
  c.incomingInvoice = { findFirst: async ({ where }) => where.organizationId === 42 ? record() : null, update: async ({ data }) => { changed = true; return record(data); }, deleteMany: async () => { changed = true; return { count: 1 }; } };
  await assert.rejects(updateIncomingInvoice({ organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, invoiceId: 1, data: { status: "PAID" } }, c), /nem engedélyezett/);
  const updated = await updateIncomingInvoice({ organizationId: 42, membership: { id: 5, role: "USER" }, actorMemberId: 5, invoiceId: 1, data: { status: "RECEIVED" } }, c);
  assert.equal(updated.status, "RECEIVED");
  changed = false;
  assert.equal(await deleteIncomingInvoice({ organizationId: 99, actorMemberId: 5, invoiceId: 1 }, c), false);
  assert.equal(changed, false);
});

test("incoming invoice detail is tenant scoped and includes authorized relations and documents", async () => {
  const c = client();
  c.incomingInvoice = { findFirst: async ({ where }) => where.organizationId === 42 ? record() : null };
  assert.equal(await getIncomingInvoiceById({ organizationId: 99, membership: { id: 5, role: "USER" }, invoiceId: 1 }, c), null);
  const found = await getIncomingInvoiceById({ organizationId: 42, membership: { id: 5, role: "USER" }, invoiceId: 1 }, c);
  assert.equal(found.supplier.name, "Szállító Kft."); assert.deepEqual(found.documents, []);
});
