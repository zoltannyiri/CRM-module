import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
import { jsx, jsxs } from "react/jsx-runtime";
import { followUpAccess, followUpTypeLabels, followUpStatusLabels, toLocalDateTime, toApiTimestamp, formatFollowUpTime, followUpQuery, isFollowUpOverdue } from "../src/components/followUp/followUpDisplay.js";
import { memberName } from "../src/components/lead/leadDisplay.js";
const source = await readFile(new URL("../src/components/followUp/FollowUpFormComponent.jsx", import.meta.url), "utf8");
const code = (await transformWithOxc(source, "FollowUpFormComponent.jsx", { jsx: { runtime: "automatic" } })).code;
const createForm = new Function("useState", "useRef", "useEffect", "useToast", "apiClient", "followUpTypeLabels", "toLocalDateTime", "toApiTimestamp", "memberName", "formatFollowUpTime", "_jsx", "_jsxs", "followUpStatusLabels",
  code.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn FollowUpForm;");
const fixture = { id: 10, leadId: 1, lead: { id: 1, name: "Lead" }, dueAt: "2026-10-25T01:30:42.123Z", type: "CALL", status: "OPEN", note: "", assignedMemberId: null };
function elements(node, type) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  return [...(node.type === type ? [node] : []), ...elements(node.props?.children, type)];
}
function harness(apiClient, mode = "edit") {
  const hooks = []; let cursor = 0;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial?.loading !== undefined ? { loading: false, error: "", leads: [fixture.lead], members: [] } : initial;
    return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
  };
  const ref = (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; };
  const component = createForm(state, ref, () => {}, () => ({ showSuccess: () => {} }), apiClient, followUpTypeLabels, toLocalDateTime, toApiTimestamp, memberName, formatFollowUpTime, jsx, jsxs, followUpStatusLabels);
  return () => { cursor = 0; return component({ mode, followUp: fixture, onClose: () => {} }); };
}
test("Follow-up form preserves exact unchanged dueAt and sends one save during pending request", async () => {
  const calls = []; let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const render = harness({ patch: (...args) => { calls.push(args); return pending; } });
  const submit = elements(render(), "form")[0].props.onSubmit;
  const first = submit({ preventDefault: () => {} }); const duplicate = submit({ preventDefault: () => {} });
  assert.equal(calls.length, 1); assert.equal(calls[0][1].dueAt, fixture.dueAt);
  assert.equal(Object.hasOwn(calls[0][1], "leadId"), false); assert.equal(Object.hasOwn(calls[0][1], "status"), false);
  assert.deepEqual(calls[0][2], { skipGlobalErrorToast: true });
  release({ data: fixture }); await Promise.all([first, duplicate]);
});
test("Follow-up edit form reports API errors inline", async () => {
  const render = harness({ patch: async () => { throw { response: { data: { message: "Rejected" } } }; } });
  await elements(render(), "form")[0].props.onSubmit({ preventDefault: () => {} });
  assert.equal(elements(render(), "p").find((element) => element.props.role === "alert").props.children, "Rejected");
});

test("Follow-up create still posts an OPEN-default payload and rejects view as a form mode", async () => {
  const calls = [];
  const render = harness({ post: async (...args) => { calls.push(args); return { data: fixture }; } }, "create");
  await elements(render(), "form")[0].props.onSubmit({ preventDefault: () => {} });
  assert.equal(calls[0][0], "/follow-ups");
  assert.equal(calls[0][1].leadId, 1);
  assert.equal(Object.hasOwn(calls[0][1], "status"), false);
  const wrapper = new Function("useAuth", "followUpAccess", "_jsx", "_jsxs",
    code.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn FollowUpFormComponent;")(
    () => ({ hasModule: () => true, hasPermission: () => true }), followUpAccess, jsx, jsxs);
  assert.equal(wrapper({ mode: "view" }), null);
});

const listSource = await readFile(new URL("../src/components/followUp/FollowUpListComponent.jsx", import.meta.url), "utf8");
const start = listSource.indexOf("export default function FollowUpListComponent(");
const end = listSource.indexOf("  if (!access.view) return null;", start);
const createList = new Function("useState", "useRef", "useEffect", "useAuth", "useToast", "apiClient", "followUpAccess", "followUpQuery",
  listSource.slice(start, end).replace("export default ", "") + "\nreturn { mutate };\n}\nreturn FollowUpListComponent;");
test("Follow-up complete handler prevents duplicate click and leaves data unchanged on failure", async () => {
  const calls = [], errors = []; let reject;
  const pending = new Promise((_resolve, decline) => { reject = decline; });
  const component = createList((initial) => [initial, () => {}], (initial) => ({ current: initial }), () => {},
    () => ({ hasModule: () => true, hasPermission: () => true }), () => ({ showSuccess: () => {}, showError: (error) => errors.push(error) }),
    { patch: (...args) => { calls.push(args); return pending; } }, followUpAccess, followUpQuery);
  let changes = 0;
  const list = component({ onChanged: () => { changes++; } });
  const first = list.mutate(fixture, "complete"), duplicate = list.mutate(fixture, "complete");
  reject({ response: { data: { message: "Completion rejected" } } }); await Promise.all([first, duplicate]);
  assert.deepEqual(calls, [["/follow-ups/10/complete", {}, { skipGlobalErrorToast: true }]]);
  assert.deepEqual(errors, ["Completion rejected"]); assert.equal(changes, 0); assert.equal(fixture.status, "OPEN");
});
test("Follow-up list actions are hidden for a viewer and loading masks empty message", async () => {
  const listCode = (await transformWithOxc(listSource, "FollowUpListComponent.jsx", { jsx: { runtime: "automatic" } })).code;
  const component = new Function("useState", "useRef", "useEffect", "useAuth", "useToast", "apiClient", "followUpAccess", "followUpQuery", "followUpStatusLabels", "followUpTypeLabels", "formatFollowUpTime", "isFollowUpOverdue", "memberName", "DataTable", "Column", "Link", "_jsx", "_jsxs",
    listCode.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn FollowUpListComponent;")(
    (initial) => [initial, () => {}], (initial) => ({ current: initial }), () => {},
    () => ({ hasModule: () => true, hasPermission: (key) => ["FOLLOW_UPS_VIEW", "LEADS_VIEW"].includes(key) }), () => ({}), {}, followUpAccess, followUpQuery,
    followUpStatusLabels, followUpTypeLabels, formatFollowUpTime, isFollowUpOverdue, memberName, "table", "column", "a", jsx, jsxs);
  const rendered = component({});
  assert.equal(elements(rendered, "column").some((column) => column.props.header === "Műveletek"), false);
  assert.equal(elements(rendered, "table")[0].props.emptyMessage.props.children, "");
  assert.ok(elements(rendered, "div").some((element) => element.props.role === "status"));
});
test("Follow-up drawer ignores a previous detail request that resolves after the latest selection", async () => {
  const relatedSource = await readFile(new URL("../src/components/followUp/RelatedFollowUpsComponent.jsx", import.meta.url), "utf8");
  const relatedCode = (await transformWithOxc(relatedSource, "RelatedFollowUpsComponent.jsx", { jsx: { runtime: "automatic" } })).code;
  const hooks = [], requests = [];
  let cursor = 0;
  const state = (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; };
  const ref = (initial) => { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; };
  const component = new Function("useState", "useRef", "useAuth", "useToast", "apiClient", "followUpAccess", "FollowUpListComponent", "FollowUpFormComponent", "_jsx", "_jsxs", "useNavigate",
    relatedCode.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn RelatedFollowUpsComponent;")(
    state, ref, () => ({ hasModule: () => true, hasPermission: () => true }), () => ({ showError: () => {} }),
    { get: () => new Promise((resolve) => requests.push(resolve)) }, followUpAccess, "list", "drawer", jsx, jsxs, () => () => {});
  const render = () => { cursor = 0; return component({ leadId: 1 }); };
  const list = elements(render(), "list")[0];
  const first = list.props.onEdit({ id: 10 }); const second = list.props.onEdit({ id: 20 });
  requests[1]({ data: { id: 20 } }); await second;
  requests[0]({ data: { id: 10 } }); await first;
  assert.equal(elements(render(), "drawer")[0].props.followUp.id, 20);
});
