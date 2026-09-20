import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { followUpAccess, followUpQuery } from "../src/components/followUp/followUpDisplay.js";

const source = await readFile(new URL("../src/components/followUp/FollowUpListComponent.jsx", import.meta.url), "utf8");
const start = source.indexOf("export default function FollowUpListComponent(");
const end = source.indexOf("  if (!access.view) return null;", start);
assert.ok(start >= 0 && end > start);
const createComponent = new Function("useState", "useRef", "useEffect", "useAuth", "useToast", "followUpAccess", "followUpQuery", "apiClient",
  source.slice(start, end).replace("export default ", "") +
  "\nreturn { page, currentPage, setPage, setResult };\n}\nreturn FollowUpListComponent;");

function paginationHarness() {
  const states = []; let cursor, rerender;
  const useState = (initial) => {
    const slot = cursor++;
    if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
    return [states[slot], (value) => {
      const next = typeof value === "function" ? value(states[slot]) : value;
      if (!Object.is(states[slot], next)) { states[slot] = next; rerender = true; }
    }];
  };
  const component = createComponent(useState, (value) => ({ current: value }), () => {},
    () => ({ hasModule: () => true, hasPermission: () => true }), () => ({}), followUpAccess, followUpQuery, {});
  const render = (props = {}) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; rerender = false;
      const result = component(props);
      if (!rerender) return result;
    }
    throw new Error("Follow-up pagination render did not settle");
  };
  const initial = render();
  initial.setResult({ items: Array.from({ length: 100 }, (_, id) => ({ id })), resolvedKey: null, error: "" });
  return render;
}

for (const filters of [
  { query: "Lead" }, { status: "OPEN" }, { type: "CALL" }, { assignedMemberId: "12" }, { period: "OVERDUE" }, { leadId: 7 }, { sort: "dueDesc" },
]) {
  test(`Follow-up pagination resets for ${Object.keys(filters)[0]} and never restores the old page`, () => {
    const render = paginationHarness();
    render().setPage(5); assert.equal(render().currentPage, 5);
    const filtered = render({ filters }); assert.equal(filtered.page, 1); assert.equal(filtered.currentPage, 1);
    filtered.setResult({ items: [{ id: 1 }], resolvedKey: null, error: "" });
    assert.equal(render({ filters }).currentPage, 1);
    const cleared = render();
    cleared.setResult({ items: Array.from({ length: 100 }, (_, id) => ({ id })), resolvedKey: null, error: "" });
    assert.equal(render().currentPage, 1);
  });
}

test("Follow-up reload alone preserves the selected page", () => {
  const render = paginationHarness();
  render().setPage(5);
  assert.equal(render({ reloadKey: 1 }).page, 5);
  assert.equal(render({ reloadKey: 2 }).currentPage, 5);
});
