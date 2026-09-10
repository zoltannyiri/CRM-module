import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("dashboard is tenant, module and permission aware", async () => {
  let enabledModules = ["PARTNERS", "PROJECTS", "TASKS"];
  let permissions = ["PARTNERS_VIEW", "PROJECTS_VIEW", "TASKS_VIEW", "ACTIVITY_VIEW"];
  const calls = [];
  const record = (name, result) => async (args) => { calls.push([name, args]); return result; };
  const fakePrisma = {
    partner: { count: record("partner.count", 4) },
    project: {
      count: record("project.count", 2),
      findMany: record("project.findMany", [{ id: 8, name: "Bevezetés", deadline: new Date("2026-09-15T00:00:00.000Z"), status: "ACTIVE" }]),
    },
    task: {
      count: async (args) => { calls.push(["task.count", args]); return args.where.dueDate ? 1 : 5; },
      findMany: async (args) => {
        calls.push(["task.findMany", args]);
        return args.where.assigneeMemberId ? [{ id: 9, title: "Saját feladat", status: "TODO", priority: "MEDIUM", dueDate: null, project: { id: 8, name: "Bevezetés" } }] : [{ id: 10, title: "Határidős feladat", dueDate: new Date("2026-09-14T00:00:00.000Z"), status: "TODO" }];
      },
    },
    activity: { findMany: record("activity.findMany", [{ id: 11, title: "Projekt létrehozva" }]) },
  };

  mock.module("../src/lib/prisma.js", { defaultExport: fakePrisma });
  mock.module("../src/services/organizationModuleService.js", { namedExports: { getEnabledModules: async () => enabledModules } });
  mock.module("../src/services/permissionService.js", { namedExports: { getEffectivePermissions: async () => permissions } });
  const { getDashboard } = await import(`../src/services/dashboardService.js?test=${Date.now()}`);
  const membership = { id: 12, role: "USER" };
  const full = await getDashboard({ organizationId: 42, membership, now: new Date("2026-09-10T12:00:00.000Z") });

  assert.deepEqual(full.stats.map(({ key }) => key), ["partners", "activeProjects", "openTasks", "overdueTasks"]);
  assert.equal(full.myTasks[0].title, "Saját feladat");
  assert.deepEqual(full.upcomingDeadlines.map(({ title }) => title), ["Határidős feladat", "Bevezetés"]);
  assert.equal(full.recentActivities[0].title, "Projekt létrehozva");
  for (const [, args] of calls) assert.equal(args.where.organizationId, 42);
  assert.equal(calls.find(([name, args]) => name === "task.findMany" && args.where.assigneeMemberId)?.[1].where.assigneeMemberId, 12);

  calls.length = 0;
  permissions = ["PARTNERS_VIEW"];
  const restricted = await getDashboard({ organizationId: 42, membership, now: new Date("2026-09-10T12:00:00.000Z") });
  assert.deepEqual(restricted, { stats: [{ key: "partners", label: "Partnerek", value: 4, route: "/partner" }] });
  assert.deepEqual(calls.map(([name]) => name), ["partner.count"]);

  calls.length = 0;
  enabledModules = [];
  const disabled = await getDashboard({ organizationId: 42, membership });
  assert.deepEqual(disabled, { stats: [] });
  assert.deepEqual(calls, []);
  mock.restoreAll();
});
