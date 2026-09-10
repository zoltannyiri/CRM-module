import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAllowedActivityEntityTypes,
  getActivities,
} from "../src/services/activityService.js";

test("getAllowedActivityEntityTypes computes allowed entity types from modules and permissions", () => {
  // All enabled and viewable
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS", "PROJECTS", "TASKS", "DOCUMENTS"],
      permissions: ["PARTNERS_VIEW", "PROJECTS_VIEW", "TASKS_VIEW", "DOCUMENTS_VIEW", "ACTIVITY_VIEW"],
    }),
    ["PARTNER", "CONTACT", "PROJECT", "TASK", "DOCUMENT"]
  );

  // Missing PROJECTS_VIEW
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS", "PROJECTS", "TASKS"],
      permissions: ["PARTNERS_VIEW", "TASKS_VIEW", "ACTIVITY_VIEW"],
    }),
    ["PARTNER", "CONTACT", "TASK"]
  );

  // PROJECTS module disabled
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS", "TASKS"],
      permissions: ["PARTNERS_VIEW", "PROJECTS_VIEW", "TASKS_VIEW", "ACTIVITY_VIEW"],
    }),
    ["PARTNER", "CONTACT", "TASK"]
  );

  // Missing ACTIVITY_VIEW -> empty list
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS", "PROJECTS", "TASKS"],
      permissions: ["PARTNERS_VIEW", "PROJECTS_VIEW", "TASKS_VIEW"],
    }),
    []
  );

  // No entity permissions -> empty list
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS", "PROJECTS", "TASKS"],
      permissions: ["ACTIVITY_VIEW"],
    }),
    []
  );

  // PARTNERS_VIEW grants both PARTNER and CONTACT
  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["PARTNERS"],
      permissions: ["PARTNERS_VIEW", "ACTIVITY_VIEW"],
    }),
    ["PARTNER", "CONTACT"]
  );

  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["DOCUMENTS"],
      permissions: ["DOCUMENTS_VIEW", "ACTIVITY_VIEW"],
    }),
    ["DOCUMENT"]
  );

  assert.deepEqual(
    getAllowedActivityEntityTypes({
      enabledModules: ["DOCUMENTS"],
      permissions: ["ACTIVITY_VIEW"],
    }),
    []
  );
});

test("getActivities filters by allowed entity types and prevents data leakage", async () => {
  const calls = [];
  const fakeClient = {
    activity: {
      findMany: async (args) => {
        calls.push(args);
        return [{ id: 1, title: "Tevékenység", entityType: args.where.entityType }];
      },
    },
    organizationModule: {
      findMany: async () => [{ module: "PARTNERS" }, { module: "PROJECTS" }, { module: "TASKS" }],
    },
    organizationMemberPermission: {
      findMany: async () => [
        { permission: "PARTNERS_VIEW" },
        { permission: "TASKS_VIEW" },
        { permission: "ACTIVITY_VIEW" },
      ],
    },
  };

  const membership = { id: 10, role: "USER" };

  // 1. User lacks PROJECTS_VIEW. Requesting general activity list should NOT include PROJECT
  calls.length = 0;
  const generalActivities = await getActivities(
    { organizationId: 42, membership },
    fakeClient
  );
  assert.ok(generalActivities.length > 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.organizationId, 42);
  assert.deepEqual(calls[0].where.entityType, { in: ["PARTNER", "CONTACT", "TASK"] });

  // 2. User lacks PROJECTS_VIEW. Requesting entityType=PROJECT should return [] immediately without DB query
  calls.length = 0;
  const projectActivities = await getActivities(
    { organizationId: 42, membership, entityType: "PROJECT" },
    fakeClient
  );
  assert.deepEqual(projectActivities, []);
  assert.equal(calls.length, 0, "No Prisma query should be executed for unauthorized entityType");

  // 3. User lacks PROJECTS_VIEW. Requesting entityType=PROJECT & entityId=5 should return [] immediately
  calls.length = 0;
  const projectDetailActivities = await getActivities(
    { organizationId: 42, membership, entityType: "PROJECT", entityId: 5 },
    fakeClient
  );
  assert.deepEqual(projectDetailActivities, []);
  assert.equal(calls.length, 0, "No Prisma query should be executed for unauthorized entityType with entityId");

  // 4. User has TASKS_VIEW. Requesting entityType=TASK should execute DB query
  calls.length = 0;
  const taskActivities = await getActivities(
    { organizationId: 42, membership, entityType: "TASK" },
    fakeClient
  );
  assert.ok(taskActivities.length > 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.organizationId, 42);
  assert.equal(calls[0].where.entityType, "TASK");

  // 5. User has ACTIVITY_VIEW but no entity view permissions -> returns [] without DB query
  const fakeRestrictedClient = {
    ...fakeClient,
    organizationMemberPermission: {
      findMany: async () => [{ permission: "ACTIVITY_VIEW" }],
    },
  };
  calls.length = 0;
  const emptyPermsActivities = await getActivities(
    { organizationId: 42, membership },
    fakeRestrictedClient
  );
  assert.deepEqual(emptyPermsActivities, []);
  assert.equal(calls.length, 0, "No DB query when allowed types is empty");
});
