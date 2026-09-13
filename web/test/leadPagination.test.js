import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Execute the actual component's pre-JSX state logic with a small hook harness.
// No DOM/test framework is needed for these pagination state regressions.
const source = await readFile(new URL("../src/components/lead/LeadListComponent.jsx", import.meta.url), "utf8");
const start = source.indexOf("export default function LeadListComponent(");
const end = source.indexOf("  if (!canView) return null;", start);
assert.ok(start >= 0 && end > start);
const createComponent = new Function("useState", "useMemo", "useEffect", "useAuth", "useToast",
  source.slice(start, end).replace("export default ", "") +
  "\n return { page, currentPage, setPage, setResult };\n}\nreturn LeadListComponent;");

function paginationHarness() {
  const states = [];
  let index;
  let pending;
  const useState = (initial) => {
    const slot = index++;
    if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
    return [states[slot], (value) => {
      const next = typeof value === "function" ? value(states[slot]) : value;
      if (!Object.is(states[slot], next)) { states[slot] = next; pending = true; }
    }];
  };
  const component = createComponent(useState, (callback) => callback(), () => {},
    () => ({ hasModule: () => true, hasPermission: () => true }),
    () => ({ showSuccess: () => {}, showError: () => {} }));
  const render = (props = {}) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      index = 0;
      pending = false;
      const result = component(props);
      if (!pending) return result;
    }
    throw new Error("Pagination render did not settle");
  };
  const initial = render();
  initial.setResult({ leads: Array.from({ length: 100 }, (_, id) => ({ id })), resolvedKey: null, error: "" });
  return render;
}

for (const [field, value] of [
  ["query", "Zoltán"],
  ["statusFilter", "QUALIFIED"],
  ["sourceFilter", "WEBSITE"],
  ["assignedMemberId", "12"],
  ["sortDirection", "asc"],
]) {
  test(`Lead pagination resets on ${field} and never restores a hidden old page`, () => {
    const render = paginationHarness();
    render().setPage(5);
    assert.equal(render().currentPage, 5);
    const filtered = render({ [field]: value });
    assert.equal(filtered.page, 1);
    assert.equal(filtered.currentPage, 1);
    filtered.setResult({ leads: [{ id: 1 }], resolvedKey: null, error: "" });
    assert.equal(render({ [field]: value }).currentPage, 1);
    const cleared = render();
    cleared.setResult({ leads: Array.from({ length: 100 }, (_, id) => ({ id })), resolvedKey: null, error: "" });
    assert.equal(render().page, 1);
    assert.equal(render().currentPage, 1);
  });
}

test("Lead create/edit reload alone preserves the selected page", () => {
  const render = paginationHarness();
  render().setPage(5);
  assert.equal(render({ reloadKey: 1 }).page, 5);
  assert.equal(render({ reloadKey: 2 }).currentPage, 5);
});
