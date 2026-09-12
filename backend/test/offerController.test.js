import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePayload } from "../src/controllers/offerController.js";

const createPayload = { partnerId: 1, issueDate: "2026-09-12", validUntil: "2026-10-12", currency: "HUF", items: [] };

test("create defaults only an omitted status and rejects explicit invalid status", () => {
  assert.equal(normalizePayload(createPayload).data.status, "DRAFT");
  for (const status of ["", null, false, "UNKNOWN"]) assert.ok(normalizePayload({ ...createPayload, status }).error);
});

test("PATCH distinguishes omitted note/project from explicit clearing", () => {
  assert.deepEqual(normalizePayload({}, { partial: true }).data, {});
  assert.deepEqual(normalizePayload({ projectId: null, note: null }, { partial: true }).data, { projectId: null, note: null });
  assert.ok(normalizePayload({ note: { text: "invalid" } }, { partial: true }).error);
});

test("payload IDs reject coercible booleans, arrays and non-integer strings", () => {
  for (const value of [true, [1], {}, "1e0", "1.0", "-1", 0, 1.5]) {
    assert.ok(normalizePayload({ partnerId: value }, { partial: true }).error);
    assert.ok(normalizePayload({ projectId: value }, { partial: true }).error);
  }
});

test("date-only validation rejects impossible dates and reversed ranges", () => {
  for (const issueDate of ["2026-02-29", "2026-04-31", "not-a-date", null, "2026-09-12T00:00:00Z"]) {
    assert.ok(normalizePayload({ issueDate }, { partial: true }).error);
  }
  assert.equal(normalizePayload({ issueDate: "2024-02-29" }, { partial: true }).data.issueDate.toISOString(), "2024-02-29T00:00:00.000Z");
  assert.ok(normalizePayload({ issueDate: "2026-09-12", validUntil: "2026-09-11" }, { partial: true }).error);
});

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
