import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { browserTimeZone, formatFollowUpTime, followUpTypeLabels } from "../src/components/followUp/followUpDisplay.js";

function elements(node, type) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  return [...(node.type === type ? [node] : []), ...elements(node.props?.children, type)];
}

test("Dashboard concrete Follow-up row navigates to its full-page detail", async () => {
  const source = await readFile(new URL("../src/pages/DashboardPage.jsx", import.meta.url), "utf8");
  const code = (await transformWithOxc(source, "DashboardPage.jsx", { jsx: { runtime: "automatic" } })).code;
  const item = { id: 123, leadId: 7, lead: { name: "Lead" }, type: "CALL", dueAt: "2026-09-20T12:30:00Z" };
  const dashboard = { stats: [], followUps: { overdue: 0, today: 1, items: [item] } };
  const states = [dashboard, false, false]; let cursor = 0;
  const navigateCalls = [];
  const component = new Function("useEffect", "useState", "useNavigate", "apiClient", "Topbar", "browserTimeZone", "formatFollowUpTime", "followUpTypeLabels", "_jsx", "_jsxs", "_Fragment",
    code.replace(/^import .*;$/gm, "").replace("export default ", "") + "\nreturn DashboardPage;")(
    () => {}, () => [states[cursor++], () => {}], () => (route) => navigateCalls.push(route), {}, "topbar",
    browserTimeZone, formatFollowUpTime, followUpTypeLabels, jsx, jsxs, Fragment);
  const tree = component();
  const row = elements(tree, "button").find((button) => elements(button, "strong").some((strong) => strong.props.children === "Lead"));
  row.props.onClick();
  assert.deepEqual(navigateCalls, ["/follow-up/123"]);
});
