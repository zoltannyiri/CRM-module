import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers";
import { transformWithOxc } from "vite";
import { jsx, jsxs } from "react/jsx-runtime";
import { followUpAccess, followUpStatusLabels, followUpTypeLabels, formatFollowUpTime, isFollowUpOverdue } from "../src/components/followUp/followUpDisplay.js";
import { memberName } from "../src/components/lead/leadDisplay.js";

const item = { id: 123, leadId: 7, lead: { id: 7, name: "Kovács Kft." }, type: "CALL", status: "OPEN", dueAt: "2026-09-18T08:00:00Z", note: "First\nSecond", createdAt: "2026-09-14T08:00:00Z", updatedAt: "2026-09-14T08:00:00Z" };
function elements(node, type) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  return [...(node.type === type ? [node] : []), ...elements(node.props?.children, type)];
}
async function compile(path, name, bindings) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, name + ".jsx", { jsx: { runtime: "automatic" } });
  return new Function(...Object.keys(bindings), code.replace(/^import .*;$/gm, "").replace("export default ", "") + `\nreturn ${name};`)(...Object.values(bindings));
}
async function harness(api, permissions = () => true) {
  const hooks = [], effects = [], navigations = [], successes = [], errors = [], edits = [];
  let cursor = 0;
  const bindings = {
    useState: (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value) => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }]; },
    useRef: (initial) => { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect: (effect) => { effects.push(effect); },
    useAuth: () => ({ hasModule: () => true, hasPermission: permissions }),
    useNavigate: () => (url) => navigations.push(url),
    useToast: () => ({ showSuccess: (s) => successes.push(s), showError: (s) => errors.push(s) }),
    apiClient: api, followUpAccess, followUpStatusLabels, followUpTypeLabels, formatFollowUpTime, isFollowUpOverdue, memberName,
    Link: "a", window: { confirm: () => true }, _jsx: jsx, _jsxs: jsxs,
  };
  const component = await compile("../src/components/followUp/FollowUpShowComponent.jsx", "FollowUpShow", bindings);
  return { bindings, effects, navigations, successes, errors, edits, render: (reloadKey = 0) => { cursor = 0; return component({ followUpId: "123", reloadKey, onEdit: (record) => edits.push(record) }); } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("direct Follow-up detail loads by URL ID, displays cards and reloads after edit", async () => {
  const calls = [];
  const h = await harness({ get: async (...args) => { calls.push(args); return { data: item }; } });
  assert.ok(elements(h.render(), "div").some((n) => n.props.role === "status"));
  h.effects.shift()(); await settle();
  const tree = h.render();
  assert.deepEqual(calls, [["/follow-ups/123", { skipGlobalErrorToast: true }]]);
  assert.equal(elements(tree, "a")[0].props.to, "/lead/7");
  assert.equal(elements(tree, "input").length, 0);
  assert.ok(elements(tree, "p").some((p) => p.props.children === item.note && p.props.className.includes("whitespace-pre-wrap")));
  elements(tree, "button").find((b) => b.props.children.includes("Módosítás")).props.onClick();
  assert.equal(h.edits[0], item);
  h.effects.length = 0; h.render(1); h.effects.shift()(); await settle();
  assert.equal(calls.length, 2);
});

test("detail complete is explicit, duplicate-safe and updates status without navigation", async () => {
  const calls = []; let release;
  const h = await harness({ get: async () => ({ data: item }), patch: (...args) => { calls.push(args); return new Promise((resolve) => { release = resolve; }); } });
  h.render(); h.effects.shift()(); await settle();
  const action = elements(h.render(), "button").find((b) => b.props.children.includes("Teljesítve")).props.onClick;
  const first = action(), duplicate = action();
  assert.equal(calls.length, 1);
  assert.ok(elements(h.render(), "button").every((b) => b.props.disabled));
  release({ data: { ...item, status: "COMPLETED", completedAt: "2026-09-14T09:00:00Z" } }); await Promise.all([first, duplicate]);
  assert.deepEqual(calls[0], ["/follow-ups/123/complete", {}, { skipGlobalErrorToast: true }]);
  assert.equal(elements(h.render(), "button").some((b) => b.props.children.includes("Teljesítve")), false);
  assert.equal(h.successes.length, 1); assert.deepEqual(h.navigations, []);
});

test("detail delete confirms and returns to list; mutation errors stay professional", async () => {
  const calls = [];
  const h = await harness({ get: async () => ({ data: item }), delete: async (...args) => calls.push(args) });
  h.render(); h.effects.shift()(); await settle();
  await elements(h.render(), "button").find((b) => b.props.children.includes("Törlés")).props.onClick();
  assert.equal(calls[0][0], "/follow-ups/123"); assert.deepEqual(h.navigations, ["/follow-up"]); assert.equal(h.successes.length, 1);
  const failed = await harness({ get: async () => ({ data: item }), patch: async () => { throw new Error("Prisma secret"); } });
  failed.render(); failed.effects.shift()(); await settle();
  await elements(failed.render(), "button").find((b) => b.props.children.includes("Teljesítve")).props.onClick();
  assert.deepEqual(failed.errors, ["Az utánkövetés teljesítése sikertelen."]);
  assert.deepEqual(failed.navigations, []);
});

test("detail has 404/error states and permission-aware actions and wrapper", async () => {
  for (const status of [404, 500]) {
    const h = await harness({ get: async () => { throw { response: { status, data: { message: "Internal error" } } }; } });
    h.render(); h.effects.shift()(); await settle();
    const tree = h.render();
    assert.equal(elements(tree, "h3")[0].props.children, status === 404 ? "Az utánkövetés nem található." : "Az utánkövetés adatai nem tölthetők be.");
    assert.equal(elements(tree, "a")[0].props.to, "/follow-up");
  }
  const h = await harness({ get: async () => ({ data: item }) }, (key) => ["FOLLOW_UPS_VIEW", "LEADS_VIEW"].includes(key));
  h.render(); h.effects.shift()(); await settle(); assert.equal(elements(h.render(), "button").length, 0);
  for (const [permission, label] of [["FOLLOW_UPS_EDIT", "Módosítás"], ["FOLLOW_UPS_DELETE", "Törlés"], ["FOLLOW_UPS_COMPLETE", "Teljesítve"]]) {
    const action = await harness({ get: async () => ({ data: item }) }, (key) => ["FOLLOW_UPS_VIEW", "LEADS_VIEW", permission].includes(key));
    action.render(); action.effects.shift()(); await settle();
    const buttons = elements(action.render(), "button");
    assert.equal(buttons.length, 1); assert.ok(buttons[0].props.children.includes(label));
  }
  for (const blocked of ["FOLLOW_UPS_VIEW", "LEADS_VIEW", "FOLLOW_UPS", "LEADS"]) {
    const wrapper = await compile("../src/components/followUp/FollowUpShowComponent.jsx", "FollowUpShowComponent", { ...h.bindings, useAuth: () => ({ hasModule: (key) => key !== blocked, hasPermission: (key) => key !== blocked }) });
    assert.equal(wrapper({ followUpId: "123" }), null);
  }
});

test("standalone and Lead related view navigate directly without fetching a drawer record", async () => {
  for (const leadId of [undefined, 7]) {
    const navigations = [];
    const component = await compile("../src/components/followUp/RelatedFollowUpsComponent.jsx", "RelatedFollowUpsComponent", {
      useState: (s) => [s, () => {}], useRef: (s) => ({ current: s }), useNavigate: () => (url) => navigations.push(url),
      useAuth: () => ({ hasModule: () => true, hasPermission: () => true }), useToast: () => ({}),
      apiClient: { get: () => assert.fail("View must only navigate") }, followUpAccess, FollowUpListComponent: "list", FollowUpFormComponent: "drawer", _jsx: jsx, _jsxs: jsxs,
    });
    const tree = component({ leadId }); elements(tree, "list")[0].props.onView(item);
    assert.deepEqual(navigations, ["/follow-up/123"]); assert.equal(elements(tree, "drawer").length, 0);
  }
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const route = app.split("\n").find((line) => line.includes('path="/follow-up/:id"'));
  for (const guard of ["FOLLOW_UPS", "FOLLOW_UPS_VIEW", "LEADS", "LEADS_VIEW"]) assert.ok(route.includes(guard));
});

test("Follow-up page renders direct detail from params without list or member requests", async () => {
  const effects = [], navigations = [];
  const component = await compile("../src/pages/FollowUpPage.jsx", "FollowUpPage", {
    useState: (s) => [s, () => {}], useEffect: (effect) => effects.push(effect), useParams: () => ({ id: "123" }), useNavigate: () => (url) => navigations.push(url),
    apiClient: { get: () => assert.fail("Detail page must leave loading to Show") }, Topbar: "topbar", RelatedFollowUpsComponent: "list", FollowUpShowComponent: "show", FollowUpFormComponent: "drawer",
    followUpPeriods: {}, followUpStatusLabels, followUpTypeLabels, memberName, _jsx: jsx, _jsxs: jsxs,
  });
  const tree = component(); effects.forEach((effect) => effect());
  assert.equal(elements(tree, "show")[0].props.followUpId, "123");
  assert.equal(elements(tree, "list").length, 0);
  elements(tree, "button")[0].props.onClick(); assert.deepEqual(navigations, ["/follow-up"]);
});
