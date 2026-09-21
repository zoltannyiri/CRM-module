import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCustomFieldDefinition, normalizeCustomFieldValues } from "../src/validation/customFieldValidation.js";

test("CustomField definition create requires key, label, fieldType and validates key format", () => {
  const valid = { key: "lead_score", label: "Lead Score", fieldType: "NUMBER" };
  assert.deepEqual(normalizeCustomFieldDefinition(valid).data, {
    key: "lead_score",
    label: "Lead Score",
    fieldType: "NUMBER",
  });

  for (const key of ["", "Invalid-Key", "has space", "UPPERCASE"]) {
    assert.ok(normalizeCustomFieldDefinition({ key, label: "L", fieldType: "TEXT" }).error);
  }
  assert.equal(normalizeCustomFieldDefinition({ key: "score_123", label: "L", fieldType: "TEXT" }).error, undefined);

  for (const label of ["", "   ", null, undefined]) {
    assert.ok(normalizeCustomFieldDefinition({ key: "k", label, fieldType: "TEXT" }).error);
  }

  for (const fieldType of ["UNKNOWN", "", null, 123]) {
    assert.ok(normalizeCustomFieldDefinition({ key: "k", label: "L", fieldType }).error);
  }
});

test("CustomField definition update rejects key and fieldType mutations and allows partial updates", () => {
  const existingField = { label: "Original", fieldType: "TEXT", options: null, defaultValue: null };
  const update = normalizeCustomFieldDefinition({ label: "Updated", sortOrder: 5, required: true }, { partial: true, existingField });
  assert.equal(update.error, undefined);
  assert.equal(update.data.label, "Updated");
  assert.equal(update.data.sortOrder, 5);
  assert.equal(update.data.required, true);
  assert.equal(update.data.key, undefined);
  assert.equal(update.data.fieldType, undefined);
  assert.ok(normalizeCustomFieldDefinition({ fieldType: "NUMBER" }, { partial: true, existingField }).error);
  assert.ok(normalizeCustomFieldDefinition({ key: "changed" }, { partial: true, existingField }).error);
});

test("CustomField definition options validation for SELECT and MULTI_SELECT", () => {
  assert.ok(normalizeCustomFieldDefinition({ key: "cat", label: "Cat", fieldType: "SELECT", options: [] }).error);
  assert.ok(normalizeCustomFieldDefinition({ key: "cat", label: "Cat", fieldType: "SELECT", options: ["a", 123] }).error);
  const ok = normalizeCustomFieldDefinition({ key: "cat", label: "Cat", fieldType: "SELECT", options: ["A", "B"] });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.data.options, ["A", "B"]);
  assert.deepEqual(normalizeCustomFieldDefinition({ options: [" A ", "B"] }, { partial: true, existingField: { label: "Cat", fieldType: "SELECT", options: ["A"], defaultValue: null } }).data.options, ["A", "B"]);
  assert.ok(normalizeCustomFieldDefinition({ options: [] }, { partial: true, existingField: { label: "Cat", fieldType: "SELECT", options: ["A"], defaultValue: null } }).error);
  assert.ok(normalizeCustomFieldDefinition({ options: ["A", " A "] }, { partial: true, existingField: { label: "Cat", fieldType: "SELECT", options: ["A"], defaultValue: null } }).error);
  assert.ok(normalizeCustomFieldDefinition({ options: ["A"] }, { partial: true, existingField: { label: "Cat", fieldType: "TEXT", options: null, defaultValue: null } }).error);
});

test("CustomField defaultValue follows the effective persisted field type and options", () => {
  const definition = (fieldType, defaultValue, options) => normalizeCustomFieldDefinition({ key: "field", label: "Field", fieldType, defaultValue, ...(options !== undefined && { options }) });
  assert.equal(definition("NUMBER", "42.5").data.defaultValue, "42.5");
  assert.ok(definition("NUMBER", "not-a-number").error);
  assert.equal(definition("BOOLEAN", true).data.defaultValue, "true");
  assert.ok(definition("BOOLEAN", "yes").error);
  assert.equal(definition("DATE", "2026-09-20").data.defaultValue, "2026-09-20");
  assert.ok(definition("DATE", "2026-02-31").error);
  assert.equal(definition("SELECT", "A", ["A", "B"]).data.defaultValue, "A");
  assert.ok(definition("SELECT", "C", ["A", "B"]).error);
  assert.equal(definition("MULTI_SELECT", '["A","B"]', ["A", "B"]).data.defaultValue, '["A","B"]');
  assert.ok(definition("MULTI_SELECT", '["C"]', ["A", "B"]).error);
  assert.ok(definition("TEXT", 42).error);
  assert.ok(definition("DATE", true).error);
  assert.ok(normalizeCustomFieldDefinition({ options: ["B"] }, { partial: true, existingField: { label: "Select", fieldType: "SELECT", options: ["A", "B"], defaultValue: "A" } }).error);
});

test("CustomField values validation enforces required, types, and options", () => {
  const fields = [
    { id: 1, key: "num", label: "Number", fieldType: "NUMBER", required: true },
    { id: 2, key: "bool", label: "Boolean", fieldType: "BOOLEAN", required: false },
    { id: 3, key: "sel", label: "Select", fieldType: "SELECT", options: ["High", "Low"], required: false },
    { id: 4, key: "multi", label: "Multi", fieldType: "MULTI_SELECT", options: ["A", "B", "C"], required: false },
    { id: 5, key: "dt", label: "Date", fieldType: "DATE", required: false },
  ];

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 1, value: "" }], fields).error);
  assert.ok(normalizeCustomFieldValues([{ customFieldId: 1, value: null }], fields).error);

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 1, value: "not_a_num" }], fields).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 1, value: "42.5" }], fields).data[0].value, "42.5");

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 2, value: "yes" }], fields).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 2, value: "true" }], fields).data[0].value, "true");
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 2, value: "false" }], fields).data[0].value, "false");

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 3, value: "Medium" }], fields).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 3, value: "High" }], fields).data[0].value, "High");

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 4, value: "[\"X\"]" }], fields).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 4, value: "[\"A\",\"C\"]" }], fields).data[0].value, "[\"A\",\"C\"]");

  assert.ok(normalizeCustomFieldValues([{ customFieldId: 5, value: "2026/09/20" }], fields).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 5, value: "2026-09-20" }], fields).data[0].value, "2026-09-20");

  // Unknown customFieldId
  assert.ok(normalizeCustomFieldValues([{ customFieldId: 999, value: "test" }], fields).error);

  // Duplicate customFieldId
  assert.ok(normalizeCustomFieldValues([{ customFieldId: 2, value: "true" }, { customFieldId: 2, value: "false" }], fields).error);

  // isCreate: true enforces presence of required field
  assert.ok(normalizeCustomFieldValues([], fields, { isCreate: true }).error);
  assert.ok(normalizeCustomFieldValues([{ customFieldId: 2, value: "true" }], fields, { isCreate: true }).error);
  assert.equal(normalizeCustomFieldValues([{ customFieldId: 1, value: "100" }], fields, { isCreate: true }).error, undefined);
});
