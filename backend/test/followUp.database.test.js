import "dotenv/config";
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import express from "express";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

test("Follow-ups real database tenant, dates, permissions, Activity and concurrency", {
  skip: process.env.FOLLOW_UPS_DB_TESTS !== "1", timeout: 180000,
}, async (t) => {
  const schema = `follow_up_audit_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^follow_up_audit_[a-f0-9]{32}$/);
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace("-pooler.", ".");
  const connectionString = url.toString();
  const pool = new Pool({ connectionString });
  let prisma, server;
  const secret = process.env.JWT_SECRET;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`); url.searchParams.set("schema", schema);
    const { stdout } = await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, timeout: 60000,
    });
    assert.match(stdout, /All migrations have been successfully applied/);
    const queries = [];
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }), log: [{ emit: "event", level: "query" }] });
    prisma.$on("query", (event) => queries.push(event.query));
    mock.module("../src/lib/prisma.js", { defaultExport: prisma });
    const service = await import("../src/services/followUpService.js");
    const { default: routes } = await import("../src/routes/followUpRoutes.js");
    const { default: activityRoutes } = await import("../src/routes/activityRoutes.js");
    const { default: dashboardRoutes } = await import("../src/routes/dashboardRoutes.js");
    const { default: pipelineRoutes } = await import("../src/routes/pipelineRoutes.js");
    const { default: pipelineService } = await import("../src/services/pipelineService.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const org = await prisma.organization.create({ data: { name: "Follow-up audit", slug: schema } });
    const foreign = await prisma.organization.create({ data: { name: "Foreign", slug: schema + "_foreign" } });
    await prisma.organizationModule.createMany({ data: [org.id, foreign.id].flatMap((organizationId) => ["FOLLOW_UPS", "LEADS", "PIPELINE"].map((module) => ({ organizationId, module, enabled: true }))) });
    const member = async (organizationId, role) => {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      return { user, membership: await prisma.organizationMember.create({ data: { organizationId, userId: user.id, role } }) };
    };
    const owner = await member(org.id, "OWNER"), user = await member(org.id, "USER"), other = await member(foreign.id, "USER");
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Own Lead", companyName: "Company", status: "QUALIFIED" } });
    const foreignLead = await prisma.lead.create({ data: { organizationId: foreign.id, name: "Foreign secret" } });
    const pipeline = await pipelineService.createPipeline({ organizationId: org.id, data: { name: "Own Pipeline" } });
    process.env.JWT_SECRET = randomUUID();
    const app = express(); app.use(express.json());
    app.use("/api/follow-ups", routes); app.use("/api/activities", activityRoutes); app.use("/api/dashboard", dashboardRoutes); app.use("/api/pipelines", pipelineRoutes);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Technical error" }));
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const ownerToken = generateAccessToken(owner.user), userToken = generateAccessToken(user.user);
    const request = async (path, { method = "GET", body, token = ownerToken } = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { "Content-Type": "application/json" }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const permissions = async (keys) => {
      await prisma.organizationMemberPermission.deleteMany({ where: { organizationMemberId: user.membership.id } });
      if (keys.length) await prisma.organizationMemberPermission.createMany({ data: keys.map((permission) => ({ organizationMemberId: user.membership.id, permission })) });
    };
    const create = (changes = {}) => service.createFollowUp({ organizationId: org.id, actorMemberId: owner.membership.id,
      data: { leadId: lead.id, type: "CALL", dueAt: new Date("2026-09-18T08:00Z"), assignedMemberId: user.membership.id, note: "Follow up", ...changes } });
    let record;
    const path = () => `/api/follow-ups/${record.id}`;
    const args = () => ({ organizationId: org.id, actorMemberId: owner.membership.id, followUpId: record.id });
    await t.test("CRUD minimal response, immutable Lead, omission/null and safe validation", async () => {
      const result = await request("/api/follow-ups", { method: "POST", body: { leadId: lead.id, type: "CALL", dueAt: "2026-09-18T10:00:00+02:00", assignedMemberId: user.membership.id, note: " note " } });
      assert.equal(result.status, 201); record = result.body;
      assert.equal(record.status, "OPEN"); assert.equal(record.completedAt, null); assert.equal(record.dueAt, "2026-09-18T08:00:00.000Z");
      assert.deepEqual(record.lead, { id: lead.id, name: "Own Lead", companyName: "Company" });
      assert.deepEqual(record.assignedMember, { id: user.membership.id, user: { firstName: "Audit", lastName: "USER" } });
      for (const key of ["organizationId", "organization", "createdByMember", "permissions"]) assert.equal(Object.hasOwn(record, key), false);
      assert.equal((await request(path())).status, 200);
      const updated = await request(path(), { method: "PATCH", body: { note: null, assignedMemberId: null } });
      assert.equal(updated.body.note, null); assert.equal(updated.body.assignedMemberId, null); assert.equal(updated.body.dueAt, record.dueAt); assert.equal(updated.body.type, "CALL");
      for (const body of [{ leadId: foreignLead.id }, { type: "SMS" }, { dueAt: "2026-02-29T00:00:00Z" }, { status: "COMPLETED" }, { completedAt: record.dueAt }, { assignedMemberId: "1" }, { note: 2 }]) assert.equal((await request(path(), { method: "PATCH", body })).status, 400);
      for (const query of ["period=", "assignedMemberId=1&assignedMemberId=2", "timeZone=invalid", "type=SMS", "search=a&search=b"]) assert.equal((await request(`/api/follow-ups?${query}`)).status, 400);
      assert.equal((await request("/api/follow-ups", { token: null })).status, 401);
    });
    await t.test("tenant attacks reject foreign FollowUp/Lead/member and direct DB mixed relations", async () => {
      const foreignRecord = await service.createFollowUp({ organizationId: foreign.id, actorMemberId: other.membership.id, data: { leadId: foreignLead.id, type: "OTHER", dueAt: new Date() } });
      for (const [method, suffix, body] of [["GET", "", undefined], ["PATCH", "", { note: "Attack" }], ["DELETE", "", undefined], ["PATCH", "/complete", {}]]) assert.equal((await request(`/api/follow-ups/${foreignRecord.id}${suffix}`, { method, body })).status, 404);
      assert.equal((await request("/api/follow-ups")).body.some(({ id }) => id === foreignRecord.id), false);
      for (const data of [{ leadId: foreignLead.id }, { assignedMemberId: other.membership.id }]) await assert.rejects(create(data), (error) => error.statusCode === 404);
      assert.equal((await request(path(), { method: "PATCH", body: { assignedMemberId: other.membership.id } })).status, 404);
      const data = { organizationId: org.id, leadId: lead.id, type: "CALL", dueAt: new Date() };
      for (const change of [{ leadId: foreignLead.id }, { assignedMemberId: other.membership.id }, { createdByMemberId: other.membership.id }]) await assert.rejects(prisma.followUp.create({ data: { ...data, ...change } }), (error) => error.code === "P2003");
      await assert.rejects(prisma.followUp.create({ data: { ...data, status: "COMPLETED", completedAt: null } }));
      await assert.rejects(prisma.followUp.create({ data: { ...data, status: "OPEN", completedAt: new Date() } }));
    });
    await t.test("explicit VIEW/CREATE/EDIT/DELETE/COMPLETE matrix and implicit OWNER", async () => {
      await permissions([]); assert.equal((await request("/api/follow-ups", { token: userToken })).status, 403);
      await permissions(["FOLLOW_UPS_VIEW"]); assert.equal((await request("/api/follow-ups", { token: userToken })).status, 403);
      await permissions(["FOLLOW_UPS_VIEW", "LEADS_VIEW"]); assert.equal((await request(path(), { token: userToken })).status, 200);
      for (const [method, suffix, body] of [["PATCH", "", { note: "Denied" }], ["PATCH", "/complete", {}], ["DELETE", "", undefined]]) assert.equal((await request(path() + suffix, { method, body, token: userToken })).status, 403);
      assert.equal((await request("/api/follow-ups", { method: "POST", body: { leadId: lead.id, type: "CALL", dueAt: record.dueAt }, token: userToken })).status, 403);
      await permissions(["FOLLOW_UPS_CREATE", "LEADS_VIEW"]);
      assert.equal((await request("/api/follow-ups", { method: "POST", body: { leadId: lead.id, type: "EMAIL", dueAt: record.dueAt }, token: userToken })).status, 403);
      await permissions(["FOLLOW_UPS_CREATE", "FOLLOW_UPS_VIEW", "LEADS_VIEW"]);
      const ownCreate = await request("/api/follow-ups", { method: "POST", body: { leadId: lead.id, type: "EMAIL", dueAt: record.dueAt }, token: userToken }); assert.equal(ownCreate.status, 201);
      await permissions(["FOLLOW_UPS_EDIT", "FOLLOW_UPS_VIEW", "LEADS_VIEW"]); assert.equal((await request(path(), { method: "PATCH", body: { note: "Allowed" }, token: userToken })).status, 200);
      assert.equal((await request(path() + "/complete", { method: "PATCH", body: {}, token: userToken })).status, 403);
      await permissions(["FOLLOW_UPS_COMPLETE", "FOLLOW_UPS_VIEW", "LEADS_VIEW"]); assert.equal((await request(`/api/follow-ups/${ownCreate.body.id}/complete`, { method: "PATCH", body: {}, token: userToken })).status, 200);
      await permissions(["FOLLOW_UPS_DELETE", "FOLLOW_UPS_VIEW", "LEADS_VIEW"]); assert.equal((await request(`/api/follow-ups/${ownCreate.body.id}`, { method: "DELETE", token: userToken })).status, 200);
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
    });
    await t.test("module dependencies independently block all domain access", async () => {
      for (const module of ["FOLLOW_UPS", "LEADS"]) {
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: false } });
        for (const [method, suffix, body] of [["GET", "", undefined], ["PATCH", "", {}], ["PATCH", "/complete", {}], ["DELETE", "", undefined]]) assert.equal((await request(path() + suffix, { method, body })).status, 403);
        assert.equal((await request("/api/follow-ups")).status, 403);
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: true } });
      }
    });
    await t.test("complete, duplicate complete, cancel and reopen are transactional domain actions", async () => {
      const before = Date.now();
      const complete = await request(path() + "/complete", { method: "PATCH", body: {} }); assert.equal(complete.status, 200);
      assert.equal(complete.body.status, "COMPLETED"); assert.ok(new Date(complete.body.completedAt).getTime() >= before);
      const repeated = await request(path() + "/complete", { method: "PATCH", body: {} }); assert.equal(repeated.body.completedAt, complete.body.completedAt);
      assert.equal(await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: record.id, action: "FOLLOW_UP_COMPLETED" } }), 1);
      assert.equal((await request(path(), { method: "PATCH", body: { status: "OPEN" } })).body.completedAt, null);
      assert.equal((await request(path(), { method: "PATCH", body: { status: "CANCELLED" } })).status, 200);
      assert.equal((await request(path() + "/complete", { method: "PATCH", body: {} })).status, 409);
      await service.updateFollowUp({ ...args(), data: { status: "OPEN" } });
      assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "QUALIFIED");
      assert.equal(await prisma.leadPipelinePosition.count({ where: { leadId: lead.id } }), 0);
    });
    await t.test("concurrent completion produces one event; update plus completion preserves both changes", async () => {
      const created = await create();
      const input = { ...args(), followUpId: created.id };
      const [first, second] = await Promise.all([service.completeFollowUp(input), service.completeFollowUp(input)]);
      assert.equal(first.completedAt.getTime(), second.completedAt.getTime());
      assert.equal(await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: created.id, action: "FOLLOW_UP_COMPLETED" } }), 1);
      await service.updateFollowUp({ ...input, data: { status: "OPEN" } });
      await Promise.all([service.updateFollowUp({ ...input, data: { note: "Concurrent metadata" } }), service.completeFollowUp(input)]);
      const final = await service.getFollowUp(input);
      assert.equal(final.note, "Concurrent metadata"); assert.equal(final.status, "COMPLETED"); assert.ok(final.completedAt);
      assert.equal(await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: created.id, action: "FOLLOW_UP_COMPLETED" } }), 2);
    });
    await t.test("Activity failure rolls back create, edit, completion and deletion", async () => {
      const failing = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
        if (key === "activity") return { create: async () => { throw new Error("Activity failure"); } };
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      } }))) };
      const before = await prisma.followUp.findUnique({ where: { id: record.id } });
      const count = await prisma.followUp.count();
      await assert.rejects(service.createFollowUp({ ...args(), data: { leadId: lead.id, type: "CALL", dueAt: new Date() } }, failing), /Activity failure/);
      assert.equal(await prisma.followUp.count(), count);
      for (const operation of [() => service.updateFollowUp({ ...args(), data: { note: "Rollback" } }, failing), () => service.completeFollowUp(args(), failing), () => service.deleteFollowUp(args(), failing)]) {
        await assert.rejects(operation(), /Activity failure/);
        assert.deepEqual(await prisma.followUp.findUnique({ where: { id: record.id } }), before);
      }
    });
    await t.test("date periods include exact boundaries and deterministic due ordering", async () => {
      const now = new Date("2026-09-14T10:00Z");
      const times = ["2026-09-14T00:00Z", "2026-09-14T09:59:59.999Z", "2026-09-14T10:00Z", "2026-09-14T10:00:00.001Z", "2026-09-14T23:59:59.999Z", "2026-09-15T00:00Z"];
      const fixtures = [];
      for (const time of times) fixtures.push(await create({ dueAt: new Date(time), note: "date-fixture" }));
      const input = { organizationId: org.id, search: "date-fixture", timeZone: "UTC", now };
      const ids = async (period) => (await service.getFollowUps({ ...input, period })).map(({ id }) => id);
      assert.deepEqual(await ids("OVERDUE"), fixtures.slice(0, 2).map(({ id }) => id));
      assert.deepEqual(await ids("TODAY"), fixtures.slice(0, 5).map(({ id }) => id));
      assert.deepEqual(await ids("UPCOMING"), fixtures.slice(3).map(({ id }) => id));
      await service.completeFollowUp({ ...args(), followUpId: fixtures[0].id });
      assert.deepEqual(await ids("COMPLETED"), [fixtures[0].id]);
      assert.deepEqual((await service.getFollowUps({ ...input, assignedMemberId: other.membership.id })).map(({ id }) => id), []);
    });
    await t.test("TODAY boundaries use timezone and DST 23/25 hour days", async () => {
      const spring = await service.getDayRange("Europe/Budapest", new Date("2026-03-29T12:00Z"));
      assert.equal(spring.start.toISOString(), "2026-03-28T23:00:00.000Z"); assert.equal(spring.end.toISOString(), "2026-03-29T22:00:00.000Z");
      assert.equal(spring.end - spring.start, 23 * 3600000);
      const autumn = await service.getDayRange("Europe/Budapest", new Date("2026-10-25T12:00Z"));
      assert.equal(autumn.end - autumn.start, 25 * 3600000);
      const late = await service.getDayRange("America/New_York", new Date("2026-09-15T02:00Z"));
      assert.equal(late.start.toISOString(), "2026-09-14T04:00:00.000Z");
    });
    await t.test("Activity/Dashboard/Pipeline data requires Follow-up and Lead view dependency", async () => {
      const boardCard = async () => (await request(`/api/pipelines/${pipeline.id}/board`, { token: userToken })).body.unassignedLeads.find(({ id }) => id === lead.id);
      for (const keys of [["ACTIVITY_VIEW", "LEADS_VIEW", "PIPELINE_VIEW"], ["ACTIVITY_VIEW", "FOLLOW_UPS_VIEW", "PIPELINE_VIEW"]]) {
        await permissions(keys);
        assert.deepEqual((await request("/api/activities?entityType=FOLLOW_UP", { token: userToken })).body, []);
        const dashboard = (await request("/api/dashboard", { token: userToken })).body;
        assert.equal(Object.hasOwn(dashboard, "followUps"), false);
        assert.equal(dashboard.recentActivities.some(({ entityType }) => entityType === "FOLLOW_UP"), false);
        if (keys.includes("LEADS_VIEW")) assert.equal(Object.hasOwn(await boardCard(), "nextFollowUp"), false);
        else assert.equal((await request(`/api/pipelines/${pipeline.id}/board`, { token: userToken })).status, 403);
      }
      await permissions(["ACTIVITY_VIEW", "FOLLOW_UPS_VIEW", "LEADS_VIEW", "PIPELINE_VIEW"]);
      assert.ok((await request("/api/activities?entityType=FOLLOW_UP", { token: userToken })).body.length);
      const dashboard = (await request("/api/dashboard?timeZone=Europe%2FBudapest", { token: userToken })).body;
      assert.ok(dashboard.followUps); assert.ok(dashboard.followUps.items.every(({ assignedMemberId }) => assignedMemberId === user.membership.id));
      assert.deepEqual(Object.keys((await boardCard()).nextFollowUp), ["dueAt"]);
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "FOLLOW_UPS" } }, data: { enabled: false } });
      assert.equal(Object.hasOwn(await boardCard(), "nextFollowUp"), false);
      assert.equal(Object.hasOwn((await request("/api/dashboard", { token: userToken })).body, "followUps"), false);
      assert.deepEqual((await request("/api/activities?entityType=FOLLOW_UP", { token: userToken })).body, []);
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "FOLLOW_UPS" } }, data: { enabled: true } });
    });
    await t.test("membership deletion clears nullable IDs without clearing tenant; Lead deletion cascades children", async () => {
      const removed = await member(org.id, "USER");
      const created = await service.createFollowUp({ organizationId: org.id, actorMemberId: removed.membership.id, data: { leadId: lead.id, type: "OTHER", dueAt: new Date(), assignedMemberId: removed.membership.id } });
      await prisma.organizationMember.delete({ where: { id: removed.membership.id } });
      const retained = await prisma.followUp.findUnique({ where: { id: created.id } });
      assert.equal(retained.organizationId, org.id); assert.equal(retained.assignedMemberId, null); assert.equal(retained.createdByMemberId, null);
      const { deleteLead } = await import("../src/services/leadService.js");
      const temporaryLead = await prisma.lead.create({ data: { organizationId: org.id, name: "Cascade Lead" } });
      const child = await create({ leadId: temporaryLead.id });
      assert.equal(await deleteLead({ organizationId: org.id, actorMemberId: owner.membership.id, leadId: temporaryLead.id }), true);
      assert.equal(await prisma.followUp.count({ where: { leadId: temporaryLead.id } }), 0);
      assert.ok(await prisma.activity.findFirst({ where: { entityType: "FOLLOW_UP", entityId: child.id } }));
    });
    await t.test("Pipeline next Follow-up is the earliest OPEN instant without per-card DB queries", async () => {
      const input = { organizationId: org.id, pipelineId: pipeline.id, canViewFollowUps: true };
      queries.length = 0;
      await pipelineService.getBoard(input);
      const baseline = queries.length;
      const ids = [];
      for (let index = 0; index < 8; index++) {
        const created = await prisma.lead.create({ data: { organizationId: org.id, name: "Batch Lead " + index } }); ids.push(created.id);
        await prisma.followUp.createMany({ data: [
          { organizationId: org.id, leadId: created.id, type: "CALL", dueAt: new Date("2026-09-20T10:00Z") },
          { organizationId: org.id, leadId: created.id, type: "OTHER", dueAt: new Date("2026-09-19T10:00Z") },
          { organizationId: org.id, leadId: created.id, type: "CALL", status: "COMPLETED", completedAt: new Date(), dueAt: new Date("2026-09-18T10:00Z") },
        ] });
      }
      queries.length = 0;
      const board = await pipelineService.getBoard(input);
      assert.ok(queries.length <= baseline + 1, `Board queries grew from ${baseline} to ${queries.length}`);
      for (const id of ids) assert.equal(board.unassignedLeads.find((item) => item.id === id).nextFollowUp.dueAt.toISOString(), "2026-09-19T10:00:00.000Z");
    });
    await t.test("no-op edit writes no event; hard delete writes one event", async () => {
      const before = await prisma.followUp.findUnique({ where: { id: record.id } });
      const count = await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: record.id } });
      await service.updateFollowUp({ ...args(), data: {} });
      assert.deepEqual(await prisma.followUp.findUnique({ where: { id: record.id } }), before);
      assert.equal(await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: record.id } }), count);
      await service.deleteFollowUp(args());
      assert.equal((await request(path())).status, 404);
      assert.equal(await prisma.activity.count({ where: { entityType: "FOLLOW_UP", entityId: record.id, action: "DELETED" } }), 1);
    });
    await t.test("backfill/initialization is idempotent and preserves disabled/custom records", async () => {
      const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");
      const { initializeMemberPermissions } = await import("../src/services/permissionService.js");
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "FOLLOW_UPS" } }, data: { enabled: false } });
      await permissions(["LEADS_VIEW"]);
      const sql = await readFile("prisma/migrations/20260914090000_add_follow_ups/migration.sql", "utf8");
      const connection = await pool.connect();
      try { await connection.query(`SET search_path TO "${schema}"`); const backfill = sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"')); await connection.query(backfill); await connection.query(backfill); }
      finally { await connection.query("RESET search_path"); connection.release(); }
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "FOLLOW_UPS" } } })).enabled, false);
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
      const keys = (await prisma.organizationMemberPermission.findMany({ where: { organizationMemberId: user.membership.id } })).map(({ permission }) => permission);
      assert.equal(keys.filter((key) => key.startsWith("FOLLOW_UPS_")).length, 5); assert.ok(keys.includes("LEADS_VIEW")); assert.equal(keys.includes("LEADS_EDIT"), false);
      const fresh = await prisma.organization.create({ data: { name: "Fresh", slug: schema + "_fresh" } });
      await initializeOrganizationModules(fresh.id); await initializeOrganizationModules(fresh.id);
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: fresh.id, module: "FOLLOW_UPS" } } })).enabled, true);
      const freshUser = await member(fresh.id, "ADMIN"); await initializeMemberPermissions(freshUser.membership.id, "ADMIN");
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: freshUser.membership.id, permission: { in: ["FOLLOW_UPS_VIEW", "FOLLOW_UPS_CREATE", "FOLLOW_UPS_EDIT", "FOLLOW_UPS_DELETE", "FOLLOW_UPS_COMPLETE"] } } }), 5);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
    if (prisma) await prisma.$disconnect(); await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
  }
});
