import assert from "node:assert/strict";
import { test } from "node:test";
import { boardColumns, pipelineAccess } from "../src/components/pipeline/pipelineDisplay.js";

test("Pipeline board keeps the unassigned UI column and deterministically orders stages", () => {
  const board = { unassignedLeads: [{ id: 1 }], stages: [{ id: 4, position: 2, name: "Later", leads: [{ id: 2 }] }, { id: 3, position: 1, name: "Tied", leads: [] }, { id: 2, position: 1, name: "First", leads: [] }] };
  const columns = boardColumns(board);
  assert.deepEqual(columns.map(({ id }) => id), [null, 2, 3, 4]);
  assert.deepEqual(columns[0].leads, [{ id: 1 }]);
  assert.deepEqual(columns[3].leads, [{ id: 2 }]);
  assert.deepEqual(board.stages.map(({ id }) => id), [4, 3, 2]);
});
test("Pipeline UI view/actions require both modules and both view permissions", () => {
  const modules = new Set(["PIPELINE", "LEADS"]);
  const permissions = new Set(["PIPELINE_VIEW", "LEADS_VIEW"]);
  const access = () => pipelineAccess((key) => modules.has(key), (key) => permissions.has(key));
  assert.deepEqual(access(), { view: true, create: false, edit: false, delete: false });
  for (const [key, action] of [["PIPELINE_CREATE", "create"], ["PIPELINE_EDIT", "edit"], ["PIPELINE_DELETE", "delete"]]) {
    permissions.add(key); assert.equal(access()[action], true); permissions.delete(key);
  }
  for (const key of ["PIPELINE_VIEW", "LEADS_VIEW"]) {
    permissions.delete(key); assert.deepEqual(access(), { view: false, create: false, edit: false, delete: false }); permissions.add(key);
  }
  for (const key of ["PIPELINE", "LEADS"]) {
    modules.delete(key); assert.equal(access().view, false); modules.add(key);
  }
});
