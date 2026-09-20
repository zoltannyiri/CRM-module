import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePartnerPayload } from "../src/validation/partnerValidation.js";

test("Partner create and conversion share a strict allowlist validator", () => {
  assert.deepEqual(normalizePartnerPayload({ name: " Partner " }).data, { name: "Partner", type: "COMPANY" });
  assert.deepEqual(normalizePartnerPayload({ name: "Person", type: "PERSON", email: " p@example.com " }).data, { name: "Person", type: "PERSON", email: "p@example.com" });
  for (const body of [null, [], {}, { name: "" }, { name: "X", organizationId: 1 }, { name: "X", createdByMemberId: 1 }, { name: "X", type: "INVALID" }, { name: "X", email: "invalid" }, { name: "X", phone: "abc" }]) {
    assert.ok(normalizePartnerPayload(body).error);
  }
});

test("Partner PATCH preserves omitted fields and validates supplied values", () => {
  assert.deepEqual(normalizePartnerPayload({}, { partial: true }).data, {});
  assert.deepEqual(normalizePartnerPayload({ note: null, email: "" }, { partial: true }).data, { note: null, email: null });
  assert.ok(normalizePartnerPayload({ name: null }, { partial: true }).error);
  assert.ok(normalizePartnerPayload({ note: {} }, { partial: true }).error);
});
