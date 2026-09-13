import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { transformWithOxc } from "vite";
import { jsx, jsxs } from "react/jsx-runtime";
import { boardColumns, pipelineAccess } from "../src/components/pipeline/pipelineDisplay.js";
import { leadSourceLabels, leadStatusLabels, memberName } from "../src/components/lead/leadDisplay.js";

const source = await readFile(new URL("../src/components/pipeline/PipelineBoardComponent.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "PipelineBoardComponent.jsx", { jsx: { runtime: "automatic" } });
const createBoard = new Function("useState", "Link", "boardColumns", "leadSourceLabels", "leadStatusLabels", "memberName", "_jsx", "_jsxs",
  code.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn PipelineBoardComponent;");
const fixture = { pipeline: { id: 1, name: "Sales" }, stages: [{ id: 10, name: "First", position: 1, leads: [] }, { id: 20, name: "Second", position: 2, leads: [] }], unassignedLeads: [{ id: 42, name: "Lead", status: "NEW", source: "OTHER", assignedMember: null }] };

function elements(node, type) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  return [...(node.type === type ? [node] : []), ...elements(node.props?.children, type)];
}
function boardHarness(props) {
  let dragged = null;
  const component = createBoard(() => [dragged, (value) => { dragged = value; }], "a", boardColumns, leadSourceLabels, leadStatusLabels, memberName, jsx, jsxs);
  return () => component({ board: fixture, canEdit: true, moving: false, ...props });
}
test("Pipeline desktop drag/drop invokes the explicit move with the target stage", () => {
  const moves = [];
  const render = boardHarness({ onMove: (...args) => moves.push(args) });
  const article = elements(render(), "article")[0];
  const transfer = [];
  article.props.onDragStart({ dataTransfer: { setData: (...args) => transfer.push(args) } });
  assert.deepEqual(transfer, [["text/plain", "42"]]);
  const target = elements(render(), "section")[2];
  let prevented = false;
  target.props.onDragOver({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  target.props.onDrop({ preventDefault: () => {} });
  assert.deepEqual(moves, [[42, 20]]);
  elements(render(), "section")[1].props.onDrop({ preventDefault: () => {} });
  assert.equal(moves.length, 1, "Completed drag must be cleared");
});
test("Pipeline touch/keyboard alternative supports stage move and removal", () => {
  const moves = [];
  const render = boardHarness({ onMove: (...args) => moves.push(args) });
  const select = elements(render(), "select")[0];
  select.props.onChange({ target: { value: "10" } });
  select.props.onChange({ target: { value: "" } });
  assert.deepEqual(moves, [[42, 10], [42, null]]);
});
test("Pipeline viewers cannot drag; pending requests disable the alternative", () => {
  const viewer = boardHarness({ canEdit: false, onMove: () => assert.fail("Viewer must not move") })();
  assert.equal(elements(viewer, "article")[0].props.draggable, false);
  assert.equal(elements(viewer, "select").length, 0);
  const pending = boardHarness({ moving: true })();
  assert.equal(elements(pending, "article")[0].props.draggable, false);
  assert.equal(elements(pending, "select")[0].props.disabled, true);
});

// Exercise the actual page request handler before its JSX, matching the existing
// headless state test pattern without introducing a component testing framework.
const pageSource = await readFile(new URL("../src/pages/PipelinePage.jsx", import.meta.url), "utf8");
const start = pageSource.indexOf("export default function PipelinePage()");
const end = pageSource.indexOf("  if (!access.view) return null;", start);
assert.ok(start >= 0 && end > start);
const createPage = new Function("useState", "useEffect", "useAuth", "useToast", "pipelineAccess", "apiClient",
  pageSource.slice(start, end).replace("export default ", "") + "\nreturn { move, result };\n}\nreturn PipelinePage;");
test("Pipeline failed move leaves the board unchanged and handles the error once", async () => {
  let reload = null;
  const errors = [];
  const calls = [];
  const component = createPage((initial) => {
    const value = initial?.pipelines ? { loaded: true, pipelines: [{ id: 1, name: "Sales", isDefault: true }], error: "" }
      : initial?.resolvedKey === null ? { board: fixture, resolvedKey: "", error: "" } : initial;
    return [value, (next) => { if (initial === 0) reload = typeof next === "function" ? next(initial) : next; }];
  }, () => {}, () => ({ hasModule: () => true, hasPermission: () => true }), () => ({ showError: (error) => errors.push(error), showSuccess: () => {} }), pipelineAccess,
  { patch: async (...args) => { calls.push(args); throw { response: { data: { message: "Move rejected" } } }; } });
  const page = component();
  await page.move(42, 20);
  assert.deepEqual(calls, [["/pipelines/1/leads/42/stage", { stageId: 20 }, { skipGlobalErrorToast: true }]]);
  assert.deepEqual(errors, ["Move rejected"]);
  assert.equal(page.result.board, fixture);
  assert.equal(reload, null);
});
