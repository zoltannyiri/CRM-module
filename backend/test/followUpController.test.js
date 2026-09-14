import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFollowUp, normalizeFilters, parseTimestamp } from "../src/controllers/followUpController.js";
import { canViewFollowUps, listWhere } from "../src/services/followUpService.js";

const payload = { leadId: 1, type: "CALL", dueAt: "2026-09-18T10:00:00+02:00" };
test("Follow-up create validates IDs/types and creates only OPEN through its domain service", () => {
  assert.equal(normalizeFollowUp(payload).data.dueAt.toISOString(), "2026-09-18T08:00:00.000Z");
  for (const change of [{ leadId: "1" }, { leadId: false }, { leadId: null }, { type: "SMS" }, { type: null }, { status: "COMPLETED" }, { organizationId: 2 }, { completedAt: payload.dueAt }]) assert.ok(normalizeFollowUp({ ...payload, ...change }).error);
});
test("Follow-up PATCH preserves omission, clears nullable fields and cannot bypass completion", () => {
  assert.deepEqual(normalizeFollowUp({}, true), { data: {} });
  assert.deepEqual(normalizeFollowUp({ note: "  ", assignedMemberId: null }, true), { data: { note: null, assignedMemberId: null } });
  assert.deepEqual(normalizeFollowUp({ status: "OPEN" }, true), { data: { status: "OPEN" } });
  for (const body of [{ leadId: 1 }, { dueAt: null }, { type: null }, { note: 1 }, { note: "\0" }, { note: "a".repeat(10001) }, { assignedMemberId: "1" }, { status: "COMPLETED" }, { status: null }]) assert.ok(normalizeFollowUp(body, true).error);
});
test("Follow-up timestamps reject normalization, implicit timezone and malformed offset", () => {
  for (const value of [null, 1, "2026-09-18", "2026-09-18T10:00", "2026-02-29T10:00:00Z", "2026-04-31T10:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T10:60:00Z", "2026-01-01T10:00:60Z", "2026-01-01T10:00:00+14:01", "2026-01-01T10:00:00+02:99"]) assert.equal(parseTimestamp(value), null);
  assert.equal(parseTimestamp("2024-02-29T23:59:59.123-05:00").toISOString(), "2024-03-01T04:59:59.123Z");
});
test("Follow-up filters validate repeated values, timezone and stable sort", () => {
  assert.equal(normalizeFilters({ timeZone: "Europe/Budapest", period: "TODAY", leadId: "1" }).data.leadId, 1);
  for (const query of [{ leadId: "1e0" }, { assignedMemberId: ["1", "2"] }, { period: "" }, { period: ["TODAY"] }, { status: false }, { type: "SMS" }, { sort: "random" }, { search: ["a", "b"] }, { timeZone: "invalid" }, { timeZone: ["UTC"] }]) assert.ok(normalizeFilters(query).error);
});
test("Follow-up visibility requires both domain modules and both view permissions", () => {
  const enabledModules = ["FOLLOW_UPS", "LEADS"], permissions = ["FOLLOW_UPS_VIEW", "LEADS_VIEW"];
  assert.equal(canViewFollowUps({ enabledModules, permissions }), true);
  for (const key of enabledModules) assert.equal(canViewFollowUps({ enabledModules: enabledModules.filter((value) => value !== key), permissions }), false);
  for (const key of permissions) assert.equal(canViewFollowUps({ enabledModules, permissions: permissions.filter((value) => value !== key) }), false);
});
test("Follow-up overdue compares exact instant and today uses exclusive next midnight", () => {
  const now = new Date("2026-09-14T10:00Z");
  const day = { start: new Date("2026-09-13T22:00Z"), end: new Date("2026-09-14T22:00Z") };
  assert.deepEqual(listWhere({ organizationId: 1, period: "OVERDUE" }, now).AND, [{ status: "OPEN", dueAt: { lt: now } }]);
  assert.deepEqual(listWhere({ organizationId: 1, period: "TODAY" }, now, day).AND, [{ status: "OPEN", dueAt: { gte: day.start, lt: day.end } }]);
});
