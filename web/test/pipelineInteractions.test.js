import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setImmediate as nextTick } from "node:timers/promises";
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
const createPage = new Function("useState", "useEffect", "useAuth", "useToast", "pipelineAccess", "apiClient", "useRef = (initial) => ({ current: initial })",
  pageSource.slice(start, end).replace("export default ", "") + "\nreturn { move, removePipeline, result, pipelineId };\n}\nreturn PipelinePage;");
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
test("Pipeline rapid move submissions send only one request before rerender", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const component = createPage((initial) => [initial?.pipelines ? { loaded: true, pipelines: [{ id: 1 }], error: "" } : initial, () => {}],
    () => {}, () => ({ hasModule: () => true, hasPermission: () => true }), () => ({ showError: () => {}, showSuccess: () => {} }), pipelineAccess,
    { patch: (...args) => { calls.push(args); return pending; } });
  const page = component();
  const first = page.move(42, 10);
  const duplicate = page.move(42, 20);
  release(); await Promise.all([first, duplicate]);
  assert.equal(calls.length, 1);
});
test("Pipeline rapid deletes confirm and submit only once before rerender", async () => {
  let confirmations = 0, calls = 0, release;
  const originalWindow = globalThis.window;
  globalThis.window = { confirm: () => { confirmations++; return true; } };
  try {
    const pending = new Promise((resolve) => { release = resolve; });
    const component = createPage((initial) => [initial?.pipelines ? { loaded: true, pipelines: [{ id: 1, name: "Sales" }], error: "" } : initial, () => {}],
      () => {}, () => ({ hasModule: () => true, hasPermission: () => true }), () => ({ showSuccess: () => {}, showError: () => {} }), pipelineAccess,
      { delete: () => { calls++; return pending; } });
    const page = component();
    const first = page.removePipeline();
    const second = page.removePipeline();
    release(); await Promise.all([first, second]);
    assert.equal(calls, 1); assert.equal(confirmations, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
});
test("Pipeline board 404 refreshes definitions and falls back after external deletion", async () => {
  const states = [], effects = [], calls = [];
  let cursor = 0;
  const component = createPage((initial) => {
    const index = cursor++;
    if (!(index in states)) states[index] = initial?.pipelines ? { loaded: true, pipelines: [{ id: 1, isDefault: true }, { id: 2 }], error: "" } : initial;
    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  }, (effect) => effects.push(effect), () => ({ hasModule: () => true, hasPermission: () => true }), () => ({}), pipelineAccess,
  { get: async (url) => {
    calls.push(url);
    if (url.endsWith("/board")) throw { response: { status: 404, data: { message: "Deleted" } } };
    return { data: [{ id: 2, isDefault: true }] };
  } });
  assert.equal(component().pipelineId, 1);
  effects[2]();
  await nextTick();
  cursor = 0;
  assert.equal(component().pipelineId, 2);
  assert.deepEqual(calls, ["/pipelines/1/board", "/pipelines"]);
});

const formSource = await readFile(new URL("../src/components/pipeline/PipelineFormComponent.jsx", import.meta.url), "utf8");
const formCode = (await transformWithOxc(formSource, "PipelineFormComponent.jsx", { jsx: { runtime: "automatic" } })).code;
const createForm = new Function("useState", "useEffect", "useToast", "apiClient", "_jsx", "_jsxs", "useRef = (initial) => ({ current: initial })",
  formCode.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn PipelineForm;");
function formHarness(apiClient) {
  const hooks = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
  };
  const useRef = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = { current: initial };
    return hooks[index];
  };
  const component = createForm(useState, () => {}, () => ({ showSuccess: () => {} }), apiClient, jsx, jsxs, useRef);
  return () => { cursor = 0; return component({ canDelete: true, onClose: () => {} }); };
}
test("Pipeline new stage keys stay attached through reorder/delete and are excluded from payload", async () => {
  const calls = [];
  const render = formHarness({ post: async (...args) => { calls.push(args); return { data: { id: 1 } }; } });
  const rows = () => elements(render(), "div").filter((element) => element.key !== null);
  elements(render(), "input")[0].props.onChange({ target: { value: "Sales" } });
  elements(render(), "button").find((element) => element.props.children === "Szakasz hozzáadása").props.onClick();
  const key = rows().at(-1).key;
  elements(rows().at(-1), "input")[0].props.onChange({ target: { value: "Custom" } });
  elements(rows().at(-1), "button")[0].props.onClick();
  assert.equal(rows().at(-2).key, key, "Reorder must move the key with the stage");
  elements(rows()[0], "button").at(-1).props.onClick();
  assert.equal(rows().at(-2).key, key);
  assert.equal(new Set(rows().map(({ key }) => key)).size, rows().length);
  await elements(render(), "form")[0].props.onSubmit({ preventDefault: () => {} });
  assert.equal(calls[0][1].stages.at(-2).name, "Custom");
  assert.ok(calls[0][1].stages.every((stage) => Object.keys(stage).join() === "name"));
});
test("Pipeline rapid form saves send only one create before rerender", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const render = formHarness({ post: (...args) => { calls.push(args); return pending; } });
  elements(render(), "input")[0].props.onChange({ target: { value: "Sales" } });
  const submit = elements(render(), "form")[0].props.onSubmit;
  const first = submit({ preventDefault: () => {} });
  const second = submit({ preventDefault: () => {} });
  release({ data: { id: 1 } }); await Promise.all([first, second]);
  assert.equal(calls.length, 1);
});
