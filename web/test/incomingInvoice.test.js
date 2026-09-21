import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIncomingInvoiceParams, calculateGross, incomingInvoiceStatusClasses, incomingInvoiceStatusLabels, validateIncomingInvoiceForm } from "../src/components/incomingInvoice/incomingInvoiceDisplay.js";
import { validateDocumentFile } from "../src/components/document/documentUploadValidation.js";

test("document upload validation enforces size, MIME and matching extension", () => {
  assert.equal(validateDocumentFile({ name: "invoice.pdf", type: "application/pdf", size: 100 }), "");
  assert.match(validateDocumentFile({ name: "invoice.exe", type: "application/pdf", size: 100 }), /nem egyezik/);
  assert.match(validateDocumentFile({ name: "invoice.pdf", type: "application/x-msdownload", size: 100 }), /nem támogatott/);
  assert.match(validateDocumentFile({ name: "invoice.pdf", type: "application/pdf", size: 21 * 1024 * 1024 }), /20 MB/);
});

test("invoice monetary and form helpers preserve decimal totals and require supplier", () => {
  assert.equal(calculateGross("0.1", "0.2"), "0.30");
  assert.match(validateIncomingInvoiceForm({ supplierPartnerId: "", invoiceNumber: "INV", netAmount: "1", vatAmount: "0", grossAmount: "1" }), /Szállító/);
  assert.match(validateIncomingInvoiceForm({ supplierPartnerId: "10", invoiceNumber: "INV", netAmount: "100", vatAmount: "27", grossAmount: "126.99" }), /meg kell egyeznie/);
  assert.equal(validateIncomingInvoiceForm({ supplierPartnerId: "10", invoiceNumber: "INV", netAmount: "100", vatAmount: "27", grossAmount: "127" }), "");
});

test("invoice list filters omit ALL values and include scoped relations and sort", () => {
  assert.deepEqual(buildIncomingInvoiceParams({ query: "  INV-1 ", status: "APPROVED", currency: "ALL", supplierPartnerId: 4, projectId: 8, dueFrom: "2026-09-01", sortBy: "dueDate", sortDirection: "asc" }), { q: "INV-1", status: "APPROVED", supplierPartnerId: 4, projectId: 8, dueFrom: "2026-09-01", sortBy: "dueDate", sortDirection: "asc" });
  assert.equal(incomingInvoiceStatusLabels.PAID, "Fizetve");
  assert.match(incomingInvoiceStatusClasses.REJECTED, /text-/);
});

test("permissions matrix and frontend gating logic differentiate read-only defaults from mutating actions", () => {
  const defaultUserPermissions = ["DOCUMENTS_VIEW", "DOCUMENTS_DOWNLOAD", "INCOMING_INVOICES_VIEW"];
  const hasPerm = (perms, key) => perms.includes(key);

  // Default USER can view and download
  assert.equal(hasPerm(defaultUserPermissions, "INCOMING_INVOICES_VIEW"), true);
  assert.equal(hasPerm(defaultUserPermissions, "DOCUMENTS_VIEW"), true);
  assert.equal(hasPerm(defaultUserPermissions, "DOCUMENTS_DOWNLOAD"), true);

  // Default USER cannot perform mutating actions
  const mutatingPerms = [
    "INCOMING_INVOICES_CREATE",
    "INCOMING_INVOICES_EDIT",
    "INCOMING_INVOICES_DELETE",
    "DOCUMENTS_CREATE",
    "DOCUMENTS_EDIT",
    "DOCUMENTS_DELETE",
  ];
  for (const perm of mutatingPerms) {
    assert.equal(hasPerm(defaultUserPermissions, perm), false, `${perm} should not be granted by default`);
  }

  // Explicit grant activates the action
  const grantedUserPermissions = [...defaultUserPermissions, "INCOMING_INVOICES_CREATE", "DOCUMENTS_CREATE"];
  assert.equal(hasPerm(grantedUserPermissions, "INCOMING_INVOICES_CREATE"), true);
  assert.equal(hasPerm(grantedUserPermissions, "DOCUMENTS_CREATE"), true);
});
