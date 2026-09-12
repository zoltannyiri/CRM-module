import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePayload, normalizeFilters } from "../src/controllers/leadController.js";
import { getAllowedActivityEntityTypes } from "../src/services/activityService.js";

test("Lead create requires a name and defaults only omitted enums", () => {
  assert.deepEqual(normalizePayload({ name: " Zoltán " }).data, { name: "Zoltán", status: "NEW", source: "OTHER" });
  for (const name of [undefined, null, false, {}, [], "", "  "]) assert.ok(normalizePayload({ name }).error);
  for (const field of ["status", "source"]) for (const value of ["", null, false, [], {}, "INVALID"]) assert.ok(normalizePayload({ name: "Lead", [field]: value }).error);
});
test("Lead PATCH preserves omitted fields, clears only nullable fields and rejects coercion", () => {
  assert.deepEqual(normalizePayload({}, { partial: true }).data, {});
  const clears = { companyName: null, email: null, phone: null, note: null, assignedMemberId: null };
  assert.deepEqual(normalizePayload(clears, { partial: true }).data, clears);
  for (const field of ["companyName", "email", "phone", "note"]) for (const value of [false, 123, [], {}]) assert.ok(normalizePayload({ [field]: value }, { partial: true }).error);
  for (const assignedMemberId of ["1", true, [1], 0, -1, 1.5, NaN, Infinity, 2147483648]) assert.ok(normalizePayload({ assignedMemberId }, { partial: true }).error);
  for (const body of [null, [], "invalid", { organizationId: 1 }, { createdByMemberId: 1 }]) assert.ok(normalizePayload(body, { partial: true }).error);
});
test("Lead email and phone validation is optional but strict", () => {
  for (const email of ["invalid", "x@", "x@y", "x y@example.com"]) assert.ok(normalizePayload({ email }, { partial: true }).error);
  for (const phone of ["abc", "123", "1234567890123456", "++361234567"]) assert.ok(normalizePayload({ phone }, { partial: true }).error);
  assert.equal(normalizePayload({ email: "lead@example.com", phone: "+36 70 123 4567" }, { partial: true }).error, undefined);
});
test("Lead filters reject empty, repeated, malformed and coercible values", () => {
  for (const field of ["status", "source", "assignedMemberId", "sortDirection"]) for (const value of ["", false, [], ["NEW", "LOST"], {}, "invalid"]) assert.ok(normalizeFilters({ [field]: value }).error);
  for (const assignedMemberId of ["1e0", "1.0", "0", "-1", "2147483648"]) assert.ok(normalizeFilters({ assignedMemberId }).error);
  assert.deepEqual(normalizeFilters({ status: "NEW", source: "WEBSITE", assignedMemberId: "12", search: " lead ", sortDirection: "asc" }).data, { status: "NEW", source: "WEBSITE", assignedMemberId: 12, search: "lead", sortDirection: "asc" });
});
test("Lead activity requires ACTIVITY_VIEW plus enabled module plus LEADS_VIEW", () => {
  const args = { enabledModules: ["LEADS"], permissions: ["ACTIVITY_VIEW", "LEADS_VIEW"] };
  assert.deepEqual(getAllowedActivityEntityTypes(args), ["LEAD"]);
  for (const permissions of [[], ["LEADS_VIEW"], ["ACTIVITY_VIEW"]]) assert.deepEqual(getAllowedActivityEntityTypes({ ...args, permissions }), []);
  assert.deepEqual(getAllowedActivityEntityTypes({ ...args, enabledModules: [] }), []);
});
