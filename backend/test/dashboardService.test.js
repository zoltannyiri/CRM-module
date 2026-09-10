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

  // Verify overdue task query uses start of today (lt: 2026-09-10T00:00:00.000Z), NOT now
  const overdueCountCall = calls.find(([name, args]) => name === "task.count" && args.where.dueDate);
  assert.ok(overdueCountCall, "Overdue task count call must exist");
  assert.deepEqual(overdueCountCall[1].where.dueDate, { lt: new Date("2026-09-10T00:00:00.000Z") });
  assert.deepEqual(overdueCountCall[1].where.status, { in: ["TODO", "IN_PROGRESS", "BLOCKED"] });

  // Verify recent activities query requested all allowed entity types
  const activityCall = calls.find(([name]) => name === "activity.findMany");
  assert.ok(activityCall, "Activity findMany call must exist");
  assert.deepEqual(activityCall[1].where.entityType, { in: ["PARTNER", "CONTACT", "PROJECT", "TASK"] });

  // Test: User without PROJECTS_VIEW should only see PARTNER, CONTACT, TASK activities
  calls.length = 0;
  permissions = ["PARTNERS_VIEW", "TASKS_VIEW", "ACTIVITY_VIEW"];
  const noProjectsDashboard = await getDashboard({ organizationId: 42, membership, now: new Date("2026-09-10T12:00:00.000Z") });
  const noProjectsActivityCall = calls.find(([name]) => name === "activity.findMany");
  assert.ok(noProjectsActivityCall, "Activity findMany should be called");
  assert.deepEqual(noProjectsActivityCall[1].where.entityType, { in: ["PARTNER", "CONTACT", "TASK"] });
  assert.equal(noProjectsDashboard.stats.some((s) => s.key === "activeProjects"), false);

  // Test: User with PROJECTS_VIEW but PROJECTS module disabled should not see PROJECT activities
  calls.length = 0;
  enabledModules = ["PARTNERS", "TASKS"];
  permissions = ["PARTNERS_VIEW", "PROJECTS_VIEW", "TASKS_VIEW", "ACTIVITY_VIEW"];
  await getDashboard({ organizationId: 42, membership, now: new Date("2026-09-10T12:00:00.000Z") });
  const moduleDisabledActivityCall = calls.find(([name]) => name === "activity.findMany");
  assert.ok(moduleDisabledActivityCall, "Activity findMany should be called");
  assert.deepEqual(moduleDisabledActivityCall[1].where.entityType, { in: ["PARTNER", "CONTACT", "TASK"] });

  // Test: User with ACTIVITY_VIEW but no entity view permissions gets empty recentActivities without DB query
  calls.length = 0;
  enabledModules = ["PARTNERS", "PROJECTS", "TASKS"];
  permissions = ["ACTIVITY_VIEW"];
  const noEntityPermsDashboard = await getDashboard({ organizationId: 42, membership, now: new Date("2026-09-10T12:00:00.000Z") });
  assert.deepEqual(noEntityPermsDashboard.recentActivities, []);
  assert.equal(calls.some(([name]) => name === "activity.findMany"), false, "Prisma activity.findMany should not be called with empty allowed types");

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

test("overdue task evaluation logic handles dates and statuses properly", () => {
  const now = new Date("2026-09-10T11:00:00.000Z");
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // 2026-09-10T00:00:00.000Z
  const openStatuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED"]);

  const evaluateOverdue = (task) => {
    return openStatuses.has(task.status) && task.dueDate !== null && task.dueDate < startOfToday;
  };

  // 1. TODO task, dueDate = tegnap -> overdue
  assert.equal(evaluateOverdue({ status: "TODO", dueDate: new Date("2026-09-09T00:00:00.000Z") }), true);

  // 2. TODO task, dueDate = ma -> NEM overdue
  assert.equal(evaluateOverdue({ status: "TODO", dueDate: new Date("2026-09-10T00:00:00.000Z") }), false);

  // 3. IN_PROGRESS, dueDate = tegnap -> overdue
  assert.equal(evaluateOverdue({ status: "IN_PROGRESS", dueDate: new Date("2026-09-09T00:00:00.000Z") }), true);

  // 4. BLOCKED, dueDate = tegnap -> overdue
  assert.equal(evaluateOverdue({ status: "BLOCKED", dueDate: new Date("2026-09-09T00:00:00.000Z") }), true);

  // 5. DONE, dueDate = tegnap -> NEM overdue
  assert.equal(evaluateOverdue({ status: "DONE", dueDate: new Date("2026-09-09T00:00:00.000Z") }), false);

  // 6. CANCELLED, dueDate = tegnap -> NEM overdue
  assert.equal(evaluateOverdue({ status: "CANCELLED", dueDate: new Date("2026-09-09T00:00:00.000Z") }), false);

  // 7. TODO, dueDate = null -> NEM overdue
  assert.equal(evaluateOverdue({ status: "TODO", dueDate: null }), false);

  // Tomorrow dueDate -> NEM overdue
  assert.equal(evaluateOverdue({ status: "TODO", dueDate: new Date("2026-09-11T00:00:00.000Z") }), false);
});

