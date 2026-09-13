import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePipeline, normalizeStage, parseId } from "../src/controllers/pipelineController.js";

test("Pipeline strict create/PATCH names, boolean and omitted fields", () => {
  assert.deepEqual(normalizePipeline({ name: " Sales " }).data, { name: "Sales" });
  assert.deepEqual(normalizePipeline({}, true).data, {});
  for (const body of [null, [], "name", { name: " " }, { name: null }, { name: 3 }, { isDefault: null }, { isDefault: "true" }, { organizationId: 1 }]) assert.ok(normalizePipeline(body, true).error);
  assert.deepEqual(normalizePipeline({ isDefault: false }, true).data, { isDefault: false });
});
test("Pipeline stages reject unknown fields, duplicates and invalid IDs", () => {
  for (const stages of [[], null, [{ name: " " }], [{ name: "Stage", id: "1" }], [{ name: "Stage", id: null }], [{ id: 1, name: "One" }, { id: 1, name: "Two" }], [{ name: "Stage", position: 1 }]]) assert.ok(normalizePipeline({ stages }, true).error);
  assert.ok(normalizePipeline({ name: "Create", stages: [{ id: 1, name: "Stage" }] }).error);
  assert.deepEqual(normalizePipeline({ stages: [{ id: 12, name: " Existing " }, { name: " New " }] }, true).data.stages, [{ id: 12, name: "Existing" }, { name: "New" }]);
});
test("Pipeline stage move/removal and reorder validate strictly", () => {
  for (const stageId of ["1", false, 0, -1, 1.5, [], {}, 2147483648]) assert.ok(normalizeStage({ stageId }, "move").error);
  assert.deepEqual(normalizeStage({ stageId: null }, "move").data, { stageId: null });
  assert.deepEqual(normalizeStage({ stageId: 12 }, "move").data, { stageId: 12 });
  for (const stageIds of [[], [1, 1], ["1"], null, [0], [1.5]]) assert.ok(normalizeStage({ stageIds }, "reorder").error);
  assert.deepEqual(normalizeStage({}, "edit").data, {});
  assert.ok(normalizeStage({}, "create").error);
});
test("Pipeline URL IDs reject coercible malformed values", () => {
  for (const value of [null, false, ["1"], "0", "-1", "1e0", "1.0", "2147483648"]) assert.equal(parseId(value), null);
  assert.equal(parseId("12"), 12);
});
