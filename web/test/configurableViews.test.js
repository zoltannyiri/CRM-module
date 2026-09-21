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
  assert.match(leadPage, /onRetry=\{listPreference\.reload\}/);
  assert.match(partnerPage, /onRetry=\{listPreference\.reload\}/);
});

test("core column registry provides layout metadata preserving original Partner and Lead widths", async () => {
  const { coreColumnLayout, customFieldColumnLayout, resolveColumnLayout } = await import("../src/components/configurableView/listColumns.js");
  const partnerLayouts = defaultListColumns.PARTNER.map((col) => resolveColumnLayout("PARTNER", col));
  assert.equal(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "name").headerClassName, "w-[26%]");
  assert.equal(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "type").headerClassName, "w-[15%]");
  assert.equal(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "email").headerClassName, "w-[21%]");
  assert.equal(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "phone").headerClassName, "w-[17%]");
  assert.ok(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "phone").bodyClassName.includes("whitespace-nowrap"));
  assert.equal(partnerLayouts.find((_, i) => defaultListColumns.PARTNER[i].key === "website").headerClassName, "w-[21%]");

  const customLayout = resolveColumnLayout("PARTNER", { type: "CUSTOM_FIELD", customFieldId: 99 });
  assert.equal(customLayout.headerClassName, customFieldColumnLayout.headerClassName);
  assert.ok(customLayout.headerClassName.includes("min-w-"));

  const [leadTable, partnerTable] = await Promise.all([
    readFile(new URL("../src/components/lead/LeadListComponent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/partner/PartnerTableView.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(leadTable, /min-w-\[1120px\]/, "Lead table must preserve min-w-[1120px]");
  assert.match(partnerTable, /resolveColumnLayout\("PARTNER",\s*column\)/, "Partner table must apply layout metadata");
  assert.match(leadTable, /resolveColumnLayout\("LEAD",\s*column\)/, "Lead table must resolve column layout");
});

test("preference load error disables save and reset, displays retry, and rejects persistence", async () => {
  const [drawerSource, hookSource] = await Promise.all([
    readFile(new URL("../src/components/configurableView/ColumnSettingsDrawer.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useListPreference.js", import.meta.url), "utf8"),
  ]);

  // Drawer contract
  assert.match(drawerSource, /isActionDisabled\s*=\s*saving\s*\|\|\s*loading\s*\|\|\s*Boolean\(error\)/);
  assert.match(drawerSource, /Újrapróbálkozás/);
  assert.match(drawerSource, /if\s*\(isActionDisabled\)\s*return;/);

  // Hook error guard contract
  assert.match(hookSource, /if\s*\(\s*error\s*\)\s*\{\s*throw new Error/);

  // Functional hook logic verification
  let requestedPuts = 0;
  let requestedDeletes = 0;
  const mockApiClient = {
    put: async () => { requestedPuts++; return { data: {} }; },
    delete: async () => { requestedDeletes++; return { data: {} }; },
  };

  // Compile useListPreference to test with our mock client
  const start = hookSource.indexOf("export function useListPreference(");
  const end = hookSource.lastIndexOf("export default useListPreference;");
  const factory = new Function("useState", "useCallback", "useEffect", "apiClient", "defaultListColumns", "storedColumn",
    hookSource.slice(start, end).replace("export function useListPreference(", "function useListPreference(") +
    "\nreturn useListPreference;"
  );

  let callIndex = 0;
  let stateMap = new Map();
  const useState = (initial) => {
    const key = callIndex++;
    if (!stateMap.has(key)) stateMap.set(key, typeof initial === "function" ? initial() : initial);
    const setVal = (updater) => {
      stateMap.set(key, typeof updater === "function" ? updater(stateMap.get(key)) : updater);
    };
    return [stateMap.get(key), setVal];
  };

  const hook = factory(useState, (fn) => fn, () => {}, mockApiClient, defaultListColumns, (c) => c);

  // Test when error state is active:
  stateMap = new Map([
    [0, { entityType: "LEAD", version: 1, customized: false, columns: [] }], // preference
    [1, false], // loading
    [2, "Az oszlopbeállítások nem tölthetők be."], // error
  ]);
  callIndex = 0;
  const instanceWithError = hook("LEAD", { enabled: false });
  assert.equal(instanceWithError.error, "Az oszlopbeállítások nem tölthetők be.");
  await assert.rejects(() => instanceWithError.save([]), /Betöltési hiba esetén az oszlopbeállítások nem menthetők/);
  await assert.rejects(() => instanceWithError.reset(), /Betöltési hiba esetén az alapértelmezett oszlopok nem állíthatók vissza/);
  assert.equal(requestedPuts, 0, "No PUT must be sent during error");
  assert.equal(requestedDeletes, 0, "No DELETE must be sent during error");
});

