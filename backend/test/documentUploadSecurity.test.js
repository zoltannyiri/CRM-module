import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDocumentType, validateUploadMetadata } from "../src/controllers/documentController.js";

test("document upload requires an allowlisted MIME and matching safe extension", () => {
  assert.equal(validateUploadMetadata("szamla.pdf", "application/pdf"), null);
  assert.equal(validateUploadMetadata("kep.webp", "image/webp"), null);
  assert.match(validateUploadMetadata("virus.exe", "application/pdf"), /Végrehajtható/);
  assert.match(validateUploadMetadata("álca.pdf", "application/x-msdownload"), /nem támogatott/);
  assert.match(validateUploadMetadata("álca.jpg", "application/pdf"), /nem egyezik/);
});

test("document type normalization maps legacy Hungarian labels to canonical keys", () => {
  assert.equal(normalizeDocumentType("GENERAL"), "GENERAL");
  assert.equal(normalizeDocumentType("Általános"), "GENERAL");
  assert.equal(normalizeDocumentType("Műszaki dokumentum"), "PROJECT_FILE");
  assert.equal(normalizeDocumentType("Szerződés"), "CONTRACT");
  assert.equal(normalizeDocumentType("Számla"), "INVOICE");
  assert.equal(normalizeDocumentType("Pénzügyi dokumentum"), "INVOICE");
  assert.equal(normalizeDocumentType("Egyéb"), "OTHER");
  assert.equal(normalizeDocumentType("INVALID_TYPE"), null);
});
