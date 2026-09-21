import assert from "node:assert/strict";
import { test } from "node:test";
import customFieldService from "../src/services/customFieldService.js";
import {
  getResolvedPreference,
  normalizePreferenceColumns,
  resetPreference,
  savePreference,
} from "../src/services/viewPreferenceService.js";
import { DEFAULT_LIST_COLUMNS } from "../src/services/viewPreferenceRegistry.js";

function fakePreferenceClient(customFields = []) {
  const preferences = new Map();
  const key = (memberId, entityType) => `${memberId}:${entityType}`;
  return {
    preferences,
    customField: {
      async findMany({ where }) {
        return customFields
          .filter((field) => field.organizationId === where.organizationId
            && field.entityType === where.entityType
            && (!Object.hasOwn(where, "active") || field.active === where.active)
            && (!where.id?.in || where.id.in.includes(field.id)))
          .map(({ id, label, fieldType }) => ({ id, label, fieldType }));
      },
    },
    entityListPreference: {
      async findFirst({ where }) {
        return preferences.get(key(where.organizationMemberId, where.entityType)) || null;
      },
      async upsert({ where, update, create }) {
        const identity = key(where.organizationMemberId_entityType.organizationMemberId, where.organizationMemberId_entityType.entityType);
        const value = preferences.has(identity) ? { ...preferences.get(identity), ...update } : { ...create };
        preferences.set(identity, value);
        return value;
      },
      async deleteMany({ where }) {
        preferences.delete(key(where.organizationMemberId, where.entityType));
      },
    },
  };
}

test("view preference returns the unchanged Lead and Partner defaults when no override exists", async () => {
  const client = fakePreferenceClient();
  for (const entityType of ["LEAD", "PARTNER"]) {
    const result = await getResolvedPreference({ organizationId: 1, organizationMemberId: 10, entityType }, client);
    assert.equal(result.customized, false);
    assert.deepEqual(result.columns.map(({ type, key }) => ({ type, key })), DEFAULT_LIST_COLUMNS[entityType]);
  }
});

test("view preference validates core columns, duplicates, required name and custom-field tenant/entity/activity", async () => {
  const client = fakePreferenceClient([
    { id: 11, organizationId: 1, entityType: "LEAD", active: true, label: "Keret", fieldType: "MONEY" },
    { id: 12, organizationId: 2, entityType: "LEAD", active: true, label: "Idegen", fieldType: "TEXT" },
    { id: 13, organizationId: 1, entityType: "PARTNER", active: true, label: "Iparág", fieldType: "SELECT" },
    { id: 14, organizationId: 1, entityType: "LEAD", active: false, label: "Inaktív", fieldType: "TEXT" },
  ]);
  const args = { organizationId: 1, entityType: "LEAD" };
  const valid = await normalizePreferenceColumns({ ...args, columns: [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 11 }] }, client);
  assert.deepEqual(valid, [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 11 }]);

  for (const columns of [
    [{ type: "CORE", key: "unknown" }, { type: "CORE", key: "name" }],
    [{ type: "CORE", key: "name" }, { type: "CORE", key: "name" }],
    [{ type: "CORE", key: "email" }],
    [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 12 }],
    [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 13 }],
    [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 14 }],
  ]) await assert.rejects(() => normalizePreferenceColumns({ ...args, columns }, client), (error) => error.statusCode === 400);
});

test("preferences are isolated by member and entity type, survive reload and reset to defaults", async () => {
  const client = fakePreferenceClient();
  const leadA = { organizationId: 1, organizationMemberId: 10, entityType: "LEAD" };
  await savePreference({ ...leadA, columns: [{ type: "CORE", key: "name" }, { type: "CORE", key: "phone" }] }, client);
  await savePreference({ organizationId: 1, organizationMemberId: 10, entityType: "PARTNER", columns: [{ type: "CORE", key: "name" }, { type: "CORE", key: "taxNumber" }] }, client);

  assert.deepEqual((await getResolvedPreference(leadA, client)).columns.map(({ key }) => key), ["name", "phone"]);
  assert.deepEqual((await getResolvedPreference({ ...leadA, organizationMemberId: 20 }, client)).columns.map(({ key }) => key), DEFAULT_LIST_COLUMNS.LEAD.map(({ key }) => key));
  assert.deepEqual((await getResolvedPreference({ ...leadA, entityType: "PARTNER" }, client)).columns.map(({ key }) => key), ["name", "taxNumber"]);

  const reset = await resetPreference(leadA, client);
  assert.equal(reset.customized, false);
  assert.deepEqual(reset.columns.map(({ key }) => key), DEFAULT_LIST_COLUMNS.LEAD.map(({ key }) => key));
});

test("a deactivated custom field is omitted from an existing preference without rewriting it", async () => {
  const fields = [{ id: 21, organizationId: 1, entityType: "LEAD", active: false, label: "Régi", fieldType: "TEXT" }];
  const client = fakePreferenceClient(fields);
  client.preferences.set("10:LEAD", { version: 1, columns: [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: 21 }] });
  const result = await getResolvedPreference({ organizationId: 1, organizationMemberId: 10, entityType: "LEAD" }, client);
  assert.deepEqual(result.columns.map(({ key }) => key), ["name"]);
  assert.equal(client.preferences.get("10:LEAD").columns.length, 2);
});

test("bulk custom-field loading uses one bounded query and maps values by entity", async () => {
  let query;
  const client = { customFieldValue: { async findMany(args) { query = args; return [
    { entityId: 101, customFieldId: 7, value: "A" },
    { entityId: 102, customFieldId: 7, value: "B" },
  ]; } } };
  const result = await customFieldService.getBulkCustomFieldValues({ organizationId: 1, entityType: "LEAD", entityIds: [101, 102], customFieldIds: [7] }, client);
  assert.deepEqual(query.where, { organizationId: 1, entityType: "LEAD", entityId: { in: [101, 102] }, customFieldId: { in: [7] } });
  assert.deepEqual(result.get(101), { 7: "A" });
  assert.deepEqual(result.get(102), { 7: "B" });
});
