import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  CORE_FILTER_DEFINITIONS,
  FILTER_OPERATOR_LABELS,
  OPERATORS_BY_VALUE_TYPE,
  buildFieldList,
  buildFieldListForColumns,
  findFieldDefinition,
  createDefaultFilter,
  panelValuesToCanonicalFilters,
  canonicalFiltersToPanelValues,
} from "../src/components/filtering/filterRegistry.js";

test("filtering registry defines complete core filters for LEAD and PARTNER", () => {
  const leadKeys = CORE_FILTER_DEFINITIONS.LEAD.map((f) => f.key);
  assert.deepEqual(leadKeys, [
    "name",
    "companyName",
    "status",
    "source",
    "email",
    "phone",
    "assignedMember",
    "createdAt",
  ]);

  const partnerKeys = CORE_FILTER_DEFINITIONS.PARTNER.map((f) => f.key);
  assert.deepEqual(partnerKeys, [
    "name",
    "type",
    "email",
    "phone",
    "website",
    "taxNumber",
    "address",
    "createdAt",
  ]);
});

test("filtering registry operators have Hungarian labels and type-appropriate mappings", () => {
  assert.equal(FILTER_OPERATOR_LABELS.CONTAINS, "tartalmazza");
  assert.equal(FILTER_OPERATOR_LABELS.EQUALS, "egyenlő");
  assert.equal(FILTER_OPERATOR_LABELS.NOT_EQUALS, "nem egyenlő");
  assert.equal(FILTER_OPERATOR_LABELS.GREATER_THAN, "nagyobb mint");
  assert.equal(FILTER_OPERATOR_LABELS.GREATER_THAN_OR_EQUAL, "nagyobb vagy egyenlő");
  assert.equal(FILTER_OPERATOR_LABELS.LESS_THAN, "kisebb mint");
  assert.equal(FILTER_OPERATOR_LABELS.LESS_THAN_OR_EQUAL, "kisebb vagy egyenlő");
  assert.equal(FILTER_OPERATOR_LABELS.BEFORE, "előtt");
  assert.equal(FILTER_OPERATOR_LABELS.AFTER, "után");
  assert.equal(FILTER_OPERATOR_LABELS.ON_OR_BEFORE, "legkésőbb ekkor");
  assert.equal(FILTER_OPERATOR_LABELS.ON_OR_AFTER, "legkorábban ekkor");
  assert.equal(FILTER_OPERATOR_LABELS.BETWEEN, "között");
  assert.equal(FILTER_OPERATOR_LABELS.IN, "ezek egyike");
  assert.equal(FILTER_OPERATOR_LABELS.NOT_IN, "ezek egyike sem");
  assert.equal(FILTER_OPERATOR_LABELS.CONTAINS_ANY, "tartalmazza bármelyiket");
  assert.equal(FILTER_OPERATOR_LABELS.CONTAINS_ALL, "tartalmazza mindegyiket");
  assert.equal(FILTER_OPERATOR_LABELS.IS_EMPTY, "üres");
  assert.equal(FILTER_OPERATOR_LABELS.IS_NOT_EMPTY, "nem üres");

  // Number/Money operators
  assert.deepEqual(OPERATORS_BY_VALUE_TYPE.NUMBER, [
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ]);

  // Date operators
  assert.ok(OPERATORS_BY_VALUE_TYPE.DATE.includes("BEFORE"));
  assert.ok(OPERATORS_BY_VALUE_TYPE.DATE.includes("AFTER"));
  assert.ok(OPERATORS_BY_VALUE_TYPE.DATE.includes("BETWEEN"));

  // Boolean operators
  assert.deepEqual(OPERATORS_BY_VALUE_TYPE.BOOLEAN, ["EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"]);

  // Multi select operators
  assert.deepEqual(OPERATORS_BY_VALUE_TYPE.MULTI_SELECT, [
    "CONTAINS_ANY",
    "CONTAINS_ALL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ]);
});

test("buildFieldList correctly merges core fields with available custom fields", () => {
  const availableColumns = [
    { type: "CORE", key: "name", label: "Név" },
    { type: "CUSTOM_FIELD", customFieldId: 101, label: "VIP Ügyfél", fieldType: "BOOLEAN" },
    { type: "CUSTOM_FIELD", customFieldId: 102, label: "Költségvetés", fieldType: "MONEY" },
  ];

  const leadFields = buildFieldList("LEAD", availableColumns);
  assert.ok(leadFields.length >= 8 + 2); // 8 core + 2 custom
  assert.equal(leadFields[0].type, "CORE");
  assert.equal(leadFields[0].key, "name");

  const vipField = leadFields.find((f) => f.type === "CUSTOM_FIELD" && f.customFieldId === 101);
  assert.ok(vipField);
  assert.equal(vipField.fieldType, "BOOLEAN");
  assert.equal(vipField.label, "VIP Ügyfél");

  const partnerFields = buildFieldList("PARTNER", availableColumns);
  assert.ok(partnerFields.length >= 8 + 2);
  const foundPartnerVip = findFieldDefinition(partnerFields, { type: "CUSTOM_FIELD", customFieldId: 101 });
  assert.ok(foundPartnerVip);
  assert.equal(foundPartnerVip.fieldType, "BOOLEAN");
});

test("createDefaultFilter builds a valid initial filter structure", () => {
  const availableColumns = [
    { type: "CUSTOM_FIELD", customFieldId: 200, label: "Prioritás", fieldType: "SELECT", options: [{ value: "A", label: "Magas" }] },
  ];
  const leadFields = buildFieldList("LEAD", availableColumns);
  const defaultFilter = createDefaultFilter(leadFields);

  assert.equal(defaultFilter.field.type, "CORE");
  assert.equal(defaultFilter.field.key, "name");
  assert.equal(defaultFilter.operator, "CONTAINS");
  assert.equal(defaultFilter.value, "");
});

test("buildFieldListForColumns builds list matching configured columns", () => {
  const columns = [
    { type: "CORE", key: "name", label: "Név" },
    { type: "CORE", key: "email", label: "Email" },
    { type: "CUSTOM_FIELD", customFieldId: 99, label: "Árbevétel", fieldType: "MONEY" },
  ];
  const fields = buildFieldListForColumns("PARTNER", columns, []);
  assert.equal(fields.length, 3);
  assert.equal(fields[0].key, "name");
  assert.equal(fields[1].key, "email");
  assert.equal(fields[2].customFieldId, 99);
});

test("panelValuesToCanonicalFilters converts form inputs to canonical filters", () => {
  const fieldList = [
    { type: "CORE", key: "name", label: "Név", valueType: "TEXT" },
    { type: "CORE", key: "status", label: "Státusz", valueType: "SELECT" },
    { type: "CUSTOM_FIELD", customFieldId: 50, label: "Összeg", fieldType: "MONEY" },
    { type: "CUSTOM_FIELD", customFieldId: 60, label: "Határidő", fieldType: "DATE" },
    { type: "CUSTOM_FIELD", customFieldId: 70, label: "Kiemelt", fieldType: "BOOLEAN" },
  ];

  const values = {
    "CORE:name": "Acme",
    "CORE:status": "NEW",
    "CUSTOM_FIELD:50": { min: "100", max: "500" },
    "CUSTOM_FIELD:60": { from: "2026-01-01", to: "2026-12-31" },
    "CUSTOM_FIELD:70": "true",
  };

  const canonical = panelValuesToCanonicalFilters(values, fieldList);
  assert.equal(canonical.length, 6); // name(CONTAINS), status(EQUALS), min(GTE), max(LTE), date(BETWEEN), bool(EQUALS)

  const nameFilter = canonical.find((f) => f.field.type === "CORE" && f.field.key === "name");
  assert.equal(nameFilter.operator, "CONTAINS");
  assert.equal(nameFilter.value, "Acme");

  const statusFilter = canonical.find((f) => f.field.type === "CORE" && f.field.key === "status");
  assert.equal(statusFilter.operator, "EQUALS");
  assert.equal(statusFilter.value, "NEW");

  const minFilter = canonical.find((f) => f.field.type === "CUSTOM_FIELD" && f.field.customFieldId === 50 && f.operator === "GREATER_THAN_OR_EQUAL");
  assert.equal(minFilter.value, 100);

  const maxFilter = canonical.find((f) => f.field.type === "CUSTOM_FIELD" && f.field.customFieldId === 50 && f.operator === "LESS_THAN_OR_EQUAL");
  assert.equal(maxFilter.value, 500);

  const dateFilter = canonical.find((f) => f.field.type === "CUSTOM_FIELD" && f.field.customFieldId === 60);
  assert.equal(dateFilter.operator, "BETWEEN");
  assert.deepEqual(dateFilter.value, { from: "2026-01-01", to: "2026-12-31" });

  const boolFilter = canonical.find((f) => f.field.type === "CUSTOM_FIELD" && f.field.customFieldId === 70);
  assert.equal(boolFilter.operator, "EQUALS");
  assert.equal(boolFilter.value, "true");

  // Roundtrip back to panel values
  const roundtrip = canonicalFiltersToPanelValues(canonical, fieldList);
  assert.equal(roundtrip["CORE:name"], "Acme");
  assert.equal(roundtrip["CORE:status"], "NEW");
  assert.equal(roundtrip["CUSTOM_FIELD:50"].min, 100);
  assert.equal(roundtrip["CUSTOM_FIELD:50"].max, 500);
  assert.equal(roundtrip["CUSTOM_FIELD:60"].from, "2026-01-01");
  assert.equal(roundtrip["CUSTOM_FIELD:60"].to, "2026-12-31");
  assert.equal(roundtrip["CUSTOM_FIELD:70"], "true");
});

test("Lead and Partner pages integrate FilterPanel, toolbar toggle button, and count badge", async () => {
  const [leadPage, partnerPage] = await Promise.all([
    readFile(new URL("../src/pages/LeadPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PartnerPage.jsx", import.meta.url), "utf8"),
  ]);

  // LeadPage
  assert.match(leadPage, /import FilterPanel from "\.\.\/components\/filtering\/FilterPanel\.jsx"/);
  assert.match(leadPage, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(leadPage, /const \[advancedFilters, setAdvancedFilters\] = useState\(\[\]\)/);
  assert.match(leadPage, /Szűrők\{advancedFilters\.length > 0 \? ` \(\$\{advancedFilters\.length\}\)` : ""\}/);
  assert.match(leadPage, /<FilterPanel[\s\S]*?entityType="LEAD"/);
  assert.match(leadPage, /filters=\{advancedFilters\}/);

  // PartnerPage
  assert.match(partnerPage, /import FilterPanel from "\.\.\/components\/filtering\/FilterPanel\.jsx"/);
  assert.match(partnerPage, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(partnerPage, /const \[advancedFilters, setAdvancedFilters\] = useState\(\[\]\)/);
  assert.match(partnerPage, /Szűrők\{advancedFilters\.length > 0 \? ` \(\$\{advancedFilters\.length\}\)` : ""\}/);
  assert.match(partnerPage, /<FilterPanel[\s\S]*?entityType="PARTNER"/);
  assert.match(partnerPage, /filters=\{advancedFilters\}/);
});

test("Lead and Partner list components accept filters prop, pass to apiClient, and preserve layout", async () => {
  const [leadList, partnerList, partnerTable] = await Promise.all([
    readFile(new URL("../src/components/lead/LeadListComponent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/partner/PartnerListComponent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/partner/PartnerTableView.jsx", import.meta.url), "utf8"),
  ]);

  // LeadListComponent
  assert.match(leadList, /filters = \[\]/);
  assert.match(leadList, /filters: JSON\.stringify\(filters\)/);
  assert.match(leadList, /tableClassName="w-full min-w-\[1120px\] border-collapse text-left"/);

  // PartnerListComponent
  assert.match(partnerList, /filters = \[\]/);
  assert.match(partnerList, /filtersKey = JSON\.stringify\(filters\)/);
  assert.match(partnerList, /filters: JSON\.stringify\(filters\)/);

  // PartnerTableView layout integrity
  assert.match(partnerTable, /resolveColumnLayout\("PARTNER",\s*column\)/);
  assert.match(partnerTable, /min-w-\[1100px\]/);
});

test("FilterPanel provides in-page Hungarian controls, labels, and action buttons", async () => {
  const panelSource = await readFile(new URL("../src/components/filtering/FilterPanel.jsx", import.meta.url), "utf8");
  assert.match(panelSource, /Szűrés mezők szerint/);
  assert.match(panelSource, /Szűrők törlése/);
  assert.match(panelSource, /Szűrés/);
  assert.match(panelSource, /Mégse/);
  assert.match(panelSource, /field\.label/);
});
