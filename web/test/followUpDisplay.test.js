import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { followUpAccess, followUpTypeLabels, followUpStatusLabels, followUpQuery, isFollowUpOverdue } from "../src/components/followUp/followUpDisplay.js";

test("Follow-up labels and actions match domain permissions", () => {
  assert.equal(followUpTypeLabels.CALL, "Telefon"); assert.equal(followUpStatusLabels.CANCELLED, "Lemondva");
  const modules = new Set(["FOLLOW_UPS", "LEADS"]), permissions = new Set(["FOLLOW_UPS_VIEW", "LEADS_VIEW"]);
  const access = () => followUpAccess((key) => modules.has(key), (key) => permissions.has(key));
  assert.deepEqual(access(), { view: true, create: false, edit: false, delete: false, complete: false });
  for (const [key, action] of [["FOLLOW_UPS_CREATE", "create"], ["FOLLOW_UPS_EDIT", "edit"], ["FOLLOW_UPS_DELETE", "delete"], ["FOLLOW_UPS_COMPLETE", "complete"]]) {
    permissions.add(key); assert.equal(access()[action], true); permissions.delete(key);
  }
  for (const key of ["FOLLOW_UPS_VIEW", "LEADS_VIEW"]) { permissions.delete(key); assert.equal(access().view, false); permissions.add(key); }
  for (const key of modules) { const changed = new Set(modules); changed.delete(key); assert.equal(followUpAccess((value) => changed.has(value), () => true).view, false); }
});
test("Follow-up filters map to backend period queries and exact overdue instant", () => {
  const query = followUpQuery({ query: " Company ", period: "TODAY", type: "CALL", leadId: 4, assignedMemberId: "2" });
  assert.equal(query.search, "Company"); assert.equal(query.period, "TODAY"); assert.equal(query.leadId, 4); assert.ok(query.timeZone);
  const now = new Date("2026-09-14T10:00Z");
  assert.equal(isFollowUpOverdue({ status: "OPEN", dueAt: now.toISOString() }, now), false);
  assert.equal(isFollowUpOverdue({ status: "OPEN", dueAt: "2026-09-14T09:59:59.999Z" }, now), true);
  assert.equal(isFollowUpOverdue({ status: "COMPLETED", dueAt: "2026-09-14T09:00Z" }, now), false);
});
test("Follow-up datetime converts browser-local values, rejects spring DST gap and preserves autumn instant", () => {
  const moduleUrl = new URL("../src/components/followUp/followUpDisplay.js", import.meta.url).href;
  const script = `import {toApiTimestamp,toLocalDateTime} from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify([
      toApiTimestamp('2026-09-15T00:30'),
      toLocalDateTime('2026-09-14T22:30:00Z'),
      toApiTimestamp('2026-03-29T02:30'),
      toApiTimestamp('2026-02-30T10:00'),
      toApiTimestamp('2026-10-25T02:30'),
      toLocalDateTime('2026-10-25T01:30:00Z')
    ]));`;
  const values = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: "Europe/Budapest" }, encoding: "utf8" }));
  assert.deepEqual(values, ["2026-09-14T22:30:00.000Z", "2026-09-15T00:30", null, null, "2026-10-25T00:30:00.000Z", "2026-10-25T02:30"]);
});
