import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  defaultListColumns,
  formatCustomFieldValue,
  moveListColumn,
  toggleListColumn,
} from "../src/components/configurableView/listColumns.js";

test("configurable views preserve the current default Lead and Partner columns", () => {
  assert.deepEqual(defaultListColumns.LEAD.map(({ key }) => key), ["name", "companyName", "status", "source", "email", "phone", "assignedMember", "createdAt"]);
  assert.deepEqual(defaultListColumns.PARTNER.map(({ key }) => key), ["name", "type", "email", "phone", "website"]);
});

test("columns can be hidden, restored, reordered and extended with a custom field", () => {
  const defaults = defaultListColumns.LEAD;
  const email = defaults.find(({ key }) => key === "email");
  const hidden = toggleListColumn(defaults, email, false);
  assert.equal(hidden.some(({ key }) => key === "email"), false);
  const restored = toggleListColumn(hidden, email, true);
  assert.equal(restored.at(-1).key, "email");
  const moved = moveListColumn(restored, restored.length - 1, -1);
  assert.equal(moved.at(-2).key, "email");
  const custom = { type: "CUSTOM_FIELD", customFieldId: 14, label: "Éves keret", fieldType: "MONEY" };
  assert.equal(toggleListColumn(moved, custom, true).at(-1), custom);
  assert.deepEqual(toggleListColumn(defaults, defaults[0], false), defaults, "required name cannot be removed");
});

test("custom-field values use human-readable type formatting", () => {
  assert.equal(formatCustomFieldValue("true", "BOOLEAN"), "Igen");
  assert.equal(formatCustomFieldValue("false", "BOOLEAN"), "Nem");
  assert.equal(formatCustomFieldValue('["IT","Építőipar"]', "MULTI_SELECT"), "IT, Építőipar");
  assert.notEqual(formatCustomFieldValue("12000000", "MONEY"), "12000000");
  assert.notEqual(formatCustomFieldValue("2026-09-21", "DATE"), "2026-09-21");
  assert.equal(formatCustomFieldValue(null, "TEXT"), "—");
});

test("Lead and Partner pages use independent persisted preferences and the reusable settings drawer", async () => {
  const [leadPage, partnerPage, drawer, hook, leadTable, partnerTable] = await Promise.all([
    readFile(new URL("../src/pages/LeadPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PartnerPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/configurableView/ColumnSettingsDrawer.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useListPreference.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/lead/LeadListComponent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/partner/PartnerTableView.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(leadPage, /useListPreference\("LEAD"/);
  assert.match(partnerPage, /useListPreference\("PARTNER"/);
  assert.match(drawer, /Oszlopok testreszabása/);
  assert.match(drawer, /Alapértelmezett visszaállítása/);
  assert.match(hook, /apiClient\.put\(`\/view-preferences\/\$\{entityType\}`/);
  assert.match(hook, /apiClient\.delete\(`\/view-preferences\/\$\{entityType\}`/);
  assert.match(leadTable, /customFieldValues\?\.\[column\.customFieldId\]/);
  assert.match(partnerTable, /customFieldValues\?\.\[column\.customFieldId\]/);
  assert.match(leadTable, /columns\.map/);
  assert.match(partnerTable, /columns\.map/);
});
