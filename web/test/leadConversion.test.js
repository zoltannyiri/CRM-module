import assert from "node:assert/strict";
import { test } from "node:test";
import { canConvertLead, conversionDestination, partnerPrefillFromLead } from "../src/components/lead/leadConversion.js";

const access = (modules, permissions) => ({
  hasModule: (key) => modules.includes(key),
  hasPermission: (key) => permissions.includes(key),
});

test("Lead conversion prefills only semantically matching Partner fields", () => {
  assert.deepEqual(partnerPrefillFromLead({ name: "Kovács Anna", companyName: " Kovács Kft. ", email: "anna@example.com", phone: "+36701234567", note: "Lead-only note", source: "WEB" }), {
    type: "COMPANY", name: "Kovács Kft.", email: "anna@example.com", phone: "+36701234567", website: "", taxNumber: "", address: "", note: "",
  });
  assert.deepEqual(partnerPrefillFromLead({ name: " Kovács Anna " }), {
    type: "PERSON", name: "Kovács Anna", email: "", phone: "", website: "", taxNumber: "", address: "", note: "",
  });
});

test("conversion action requires both modules, both permissions and an unconverted Lead", () => {
  const allowed = access(["LEADS", "PARTNERS"], ["LEADS_CONVERT", "PARTNERS_CREATE"]);
  assert.equal(canConvertLead({ lead: { id: 1, convertedAt: null }, ...allowed }), true);
  assert.equal(canConvertLead({ lead: { id: 1, convertedAt: "2026-09-20T12:00:00Z" }, ...allowed }), false);
  for (const modules of [["LEADS"], ["PARTNERS"]]) assert.equal(canConvertLead({ lead: { id: 1 }, ...access(modules, ["LEADS_CONVERT", "PARTNERS_CREATE"]) }), false);
  for (const permissions of [["LEADS_CONVERT"], ["PARTNERS_CREATE"]]) assert.equal(canConvertLead({ lead: { id: 1 }, ...access(["LEADS", "PARTNERS"], permissions) }), false);
});

test("successful conversion navigates only with PARTNERS_VIEW-compatible Partner response", () => {
  assert.equal(conversionDestination({ partner: { id: 42, name: "Partner" } }, true), "/partner/42");
  assert.equal(conversionDestination({ partner: { id: 42, name: "Partner" } }, false), null);
  assert.equal(conversionDestination({ lead: { convertedAt: "2026-09-20T12:00:00Z" } }, true), null);
});
