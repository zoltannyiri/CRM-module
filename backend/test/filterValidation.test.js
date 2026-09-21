import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFilters } from "../src/validation/filterValidation.js";

function fakeCustomFieldClient(fields = []) {
  return {
    customField: {
      async findMany({ where }) {
        return fields.filter(
          (f) =>
            f.organizationId === where.organizationId &&
            (!where.id?.in || where.id.in.includes(f.id))
        );
      },
    },
  };
}

test("filter normalization handles null/empty/undefined as empty filter list", async () => {
  const client = fakeCustomFieldClient();
  const res1 = await normalizeFilters(undefined, { organizationId: 1, entityType: "LEAD" }, client);
  assert.deepEqual(res1.data, []);

  const res2 = await normalizeFilters("", { organizationId: 1, entityType: "LEAD" }, client);
  assert.deepEqual(res2.data, []);

  const res3 = await normalizeFilters(null, { organizationId: 1, entityType: "LEAD" }, client);
  assert.deepEqual(res3.data, []);
});

test("filter normalization rejects invalid JSON, non-arrays and limits (> 20 filters)", async () => {
  const client = fakeCustomFieldClient();
  const badJson = await normalizeFilters("invalid json{", { organizationId: 1, entityType: "LEAD" }, client);
  assert.ok(badJson.error);

  const notArray = await normalizeFilters({ field: "foo" }, { organizationId: 1, entityType: "LEAD" }, client);
  assert.ok(notArray.error);

  const over20 = Array.from({ length: 21 }, () => ({
    field: { type: "CORE", key: "name" },
    operator: "CONTAINS",
    value: "test",
  }));
  const tooMany = await normalizeFilters(over20, { organizationId: 1, entityType: "LEAD" }, client);
  assert.ok(tooMany.error);
});

test("filter normalization validates CORE TEXT fields (CONTAINS, EQUALS, length limits, empty)", async () => {
  const client = fakeCustomFieldClient();

  const valid = await normalizeFilters(
    [{ field: { type: "CORE", key: "name" }, operator: "CONTAINS", value: "Acme" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.deepEqual(valid.data, [
    { field: { type: "CORE", key: "name" }, operator: "CONTAINS", value: "Acme" },
  ]);

  const invalidOp = await normalizeFilters(
    [{ field: { type: "CORE", key: "name" }, operator: "GREATER_THAN", value: "Acme" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(invalidOp.error);

  const tooLong = await normalizeFilters(
    [{ field: { type: "CORE", key: "name" }, operator: "EQUALS", value: "a".repeat(501) }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(tooLong.error);

  const emptyVal = await normalizeFilters(
    [{ field: { type: "CORE", key: "name" }, operator: "EQUALS", value: "   " }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(emptyVal.error);

  const isEmpty = await normalizeFilters(
    [{ field: { type: "CORE", key: "email" }, operator: "IS_EMPTY" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.deepEqual(isEmpty.data, [
    { field: { type: "CORE", key: "email" }, operator: "IS_EMPTY", value: null },
  ]);
});

test("filter normalization validates CORE SELECT fields (options, IN, NOT_IN)", async () => {
  const client = fakeCustomFieldClient();

  const validStatus = await normalizeFilters(
    [{ field: { type: "CORE", key: "status" }, operator: "EQUALS", value: "QUALIFIED" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(validStatus.data[0].value, "QUALIFIED");

  const invalidStatus = await normalizeFilters(
    [{ field: { type: "CORE", key: "status" }, operator: "EQUALS", value: "UNKNOWN_STATUS" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(invalidStatus.error);

  const validIn = await normalizeFilters(
    [{ field: { type: "CORE", key: "status" }, operator: "IN", value: ["NEW", "QUALIFIED"] }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.deepEqual(validIn.data[0].value, ["NEW", "QUALIFIED"]);

  const invalidIn = await normalizeFilters(
    [{ field: { type: "CORE", key: "status" }, operator: "IN", value: ["NEW", "WRONG"] }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(invalidIn.error);
});

test("filter normalization validates CORE MEMBER and DATETIME fields", async () => {
  const client = fakeCustomFieldClient();

  const validMember = await normalizeFilters(
    [{ field: { type: "CORE", key: "assignedMember" }, operator: "EQUALS", value: 12 }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(validMember.data[0].value, 12);

  const invalidMember = await normalizeFilters(
    [{ field: { type: "CORE", key: "assignedMember" }, operator: "EQUALS", value: "abc" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(invalidMember.error);

  const validCreated = await normalizeFilters(
    [{ field: { type: "CORE", key: "createdAt" }, operator: "AFTER", value: "2026-01-01" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(validCreated.data[0].value, "2026-01-01");

  const validBetween = await normalizeFilters(
    [{ field: { type: "CORE", key: "createdAt" }, operator: "BETWEEN", value: { from: "2026-01-01", to: "2026-06-30" } }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.deepEqual(validBetween.data[0].value, { from: "2026-01-01", to: "2026-06-30" });

  const invalidBetween = await normalizeFilters(
    [{ field: { type: "CORE", key: "createdAt" }, operator: "BETWEEN", value: { from: "2026-06-30", to: "2026-01-01" } }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(invalidBetween.error);
});

test("filter normalization validates Custom Fields tenant isolation, entity type, active state", async () => {
  const customFields = [
    { id: 10, organizationId: 1, entityType: "LEAD", active: true, fieldType: "MONEY", label: "Keret" },
    { id: 20, organizationId: 2, entityType: "LEAD", active: true, fieldType: "MONEY", label: "Idegen Keret" },
    { id: 30, organizationId: 1, entityType: "PARTNER", active: true, fieldType: "TEXT", label: "Partner Mező" },
    { id: 40, organizationId: 1, entityType: "LEAD", active: false, fieldType: "TEXT", label: "Inaktív Mező" },
  ];
  const client = fakeCustomFieldClient(customFields);

  const valid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 10 }, operator: "GREATER_THAN", value: 10000000 }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(valid.data[0].field.customFieldId, 10);
  assert.equal(valid.data[0].value, 10000000);

  const crossTenant = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 20 }, operator: "GREATER_THAN", value: 500 }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(crossTenant.error);

  const wrongEntity = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 30 }, operator: "CONTAINS", value: "test" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(wrongEntity.error);

  const inactive = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 40 }, operator: "CONTAINS", value: "test" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(inactive.error);
});

test("filter normalization validates Custom Field types: NUMBER/MONEY, BOOLEAN, DATE, SELECT, MULTI_SELECT", async () => {
  const customFields = [
    { id: 1, organizationId: 1, entityType: "LEAD", active: true, fieldType: "NUMBER", label: "Szám" },
    { id: 2, organizationId: 1, entityType: "LEAD", active: true, fieldType: "BOOLEAN", label: "Fontos" },
    { id: 3, organizationId: 1, entityType: "LEAD", active: true, fieldType: "DATE", label: "Dátum" },
    { id: 4, organizationId: 1, entityType: "LEAD", active: true, fieldType: "SELECT", label: "Kategória", options: ["A", "B", "C"] },
    { id: 5, organizationId: 1, entityType: "LEAD", active: true, fieldType: "MULTI_SELECT", label: "Címkék", options: ["Tech", "Sales", "HR"] },
  ];
  const client = fakeCustomFieldClient(customFields);

  // NUMBER: valid and invalid
  const numValid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 1 }, operator: "GREATER_THAN_OR_EQUAL", value: "42.5" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(numValid.data[0].value, 42.5);

  const numInvalid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 1 }, operator: "LESS_THAN", value: "not-a-number" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(numInvalid.error);

  // BOOLEAN: valid true/false, invalid "igen"
  const boolTrue = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 2 }, operator: "EQUALS", value: true }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(boolTrue.data[0].value, "true");

  const boolFalse = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 2 }, operator: "EQUALS", value: "false" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(boolFalse.data[0].value, "false");

  const boolInvalid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 2 }, operator: "EQUALS", value: "igen" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(boolInvalid.error);

  // DATE: valid and invalid
  const dateValid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 3 }, operator: "ON_OR_BEFORE", value: "2026-12-31" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(dateValid.data[0].value, "2026-12-31");

  const dateInvalid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 3 }, operator: "BEFORE", value: "2026-02-30" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(dateInvalid.error);

  // SELECT: valid and invalid option
  const selValid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 4 }, operator: "EQUALS", value: "B" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.equal(selValid.data[0].value, "B");

  const selInvalid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 4 }, operator: "EQUALS", value: "Z" }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(selInvalid.error);

  // MULTI_SELECT: valid and invalid option
  const multiValid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 5 }, operator: "CONTAINS_ANY", value: ["Tech", "Sales"] }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.deepEqual(multiValid.data[0].value, ["Tech", "Sales"]);

  const multiInvalid = await normalizeFilters(
    [{ field: { type: "CUSTOM_FIELD", customFieldId: 5 }, operator: "CONTAINS_ALL", value: ["Tech", "Unknown"] }],
    { organizationId: 1, entityType: "LEAD" },
    client
  );
  assert.ok(multiInvalid.error);
});
