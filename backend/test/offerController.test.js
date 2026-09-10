import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePayload } from "../src/controllers/offerController.js";

test("PATCH without status preserves the existing offer status", () => {
  const normalized = normalizePayload({ note: "Frissített megjegyzés" }, { partial: true });

  assert.equal(normalized.error, undefined);
  assert.equal(Object.hasOwn(normalized.data, "status"), false);
});

test("PATCH rejects an explicitly empty offer status", () => {
  const normalized = normalizePayload({ status: "" }, { partial: true });

  assert.equal(normalized.error, "Érvénytelen ajánlatstátusz.");
});

test("PATCH rejects an unknown offer status", () => {
  const normalized = normalizePayload({ status: "UNKNOWN" }, { partial: true });

  assert.equal(normalized.error, "Érvénytelen ajánlatstátusz.");
});

test("PATCH accepts a valid offer status", () => {
  const normalized = normalizePayload({ status: "SENT" }, { partial: true });

  assert.equal(normalized.error, undefined);
  assert.equal(normalized.data.status, "SENT");
});
