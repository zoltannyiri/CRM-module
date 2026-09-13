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

// Opt-in. Runs all migrations, CRUD and authorization tests in an isolated schema.
// No existing application rows are read or changed; the scratch schema is dropped.
test("Pipeline real database security, integrity and migration", {
  skip: process.env.PIPELINE_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `pipeline_audit_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^pipeline_audit_[a-f0-9]{32}$/);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let prisma;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("schema", schema);
    const { stdout } = await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      // Each run owns a fresh schema. Avoid database-wide session advisory locks
      // leaking through a transaction pooler; production migration settings stay intact.
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, timeout: 60000,
    });
    assert.match(stdout, /All migrations have been successfully applied/);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }) });
    mock.module("../src/lib/prisma.js", { defaultExport: prisma });
    const { default: service } = await import("../src/services/pipelineService.js");
    const { default: routes } = await import("../src/routes/pipelineRoutes.js");
    const { default: activityRoutes } = await import("../src/routes/activityRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const org = await prisma.organization.create({ data: { name: "Pipeline audit", slug: schema } });
    const other = await prisma.organization.create({ data: { name: "Foreign", slug: schema + "_other" } });
    await prisma.organizationModule.createMany({ data: ["PIPELINE", "LEADS"].map((module) => ({ organizationId: org.id, module, enabled: true })) });
    const member = async (role, organizationId = org.id) => {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      const membership = await prisma.organizationMember.create({ data: { organizationId, userId: user.id, role } });
      return { user, membership };
    };
    const owner = await member("OWNER");
    const admin = await member("ADMIN");
    const user = await member("USER");
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Own lead", companyName: "Test company", assignedMemberId: admin.membership.id, status: "QUALIFIED" } });
    const secondLead = await prisma.lead.create({ data: { organizationId: org.id, name: "Second lead" } });
    const foreignLead = await prisma.lead.create({ data: { organizationId: other.id, name: "Secret lead" } });
    const foreignPipeline = await service.createPipeline({ organizationId: other.id, data: { name: "Secret pipeline" } });
    const secret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const app = express();
    app.use(express.json());
    app.use("/api/pipelines", routes);
    app.use("/api/activities", activityRoutes);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : "Audit technical error" }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const ownerToken = generateAccessToken(owner.user);
    const userToken = generateAccessToken(user.user);
    const request = async (path, { token = ownerToken, method = "GET", body } = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { "Content-Type": "application/json" }) }, body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    const perms = async (permissions) => {
      await prisma.organizationMemberPermission.deleteMany({ where: { organizationMemberId: user.membership.id } });
      if (permissions.length) await prisma.organizationMemberPermission.createMany({ data: permissions.map((permission) => ({ organizationMemberId: user.membership.id, permission })) });
    };
    let pipeline;
    let alternate;
    const movePath = () => `/api/pipelines/${pipeline.id}/leads/${lead.id}/stage`;
    try {
      await t.test("pipeline CRUD definitions, defaults and minimal board response", async () => {
        const created = await request("/api/pipelines", { method: "POST", body: { name: "Sales" } });
        assert.equal(created.status, 201);
        pipeline = created.body;
        assert.equal(pipeline.isDefault, true);
        assert.equal(pipeline.stages.length, 7);
        alternate = (await request("/api/pipelines", { method: "POST", body: { name: "Alternate", stages: [{ name: "First" }, { name: "Last" }] } })).body;
        const definition = await request(`/api/pipelines/${pipeline.id}`);
        assert.equal(definition.status, 200);
        assert.equal(Object.hasOwn(definition.body, "organizationId"), false);
        assert.equal(Object.hasOwn(definition.body, "leadPositions"), false);
        const board = await request(`/api/pipelines/${pipeline.id}/board`);
        assert.deepEqual(board.body.unassignedLeads.map(({ id }) => id).sort(), [lead.id, secondLead.id].sort());
        assert.deepEqual(board.body.stages.map(({ position }) => position), [1, 2, 3, 4, 5, 6, 7]);
        const card = board.body.unassignedLeads.find(({ id }) => id === lead.id);
        assert.deepEqual(card.assignedMember, { id: admin.membership.id, user: { firstName: "Audit", lastName: "ADMIN" } });
        for (const field of ["organizationId", "pipelinePosition", "email", "note", "createdByMember"]) assert.equal(Object.hasOwn(card, field), false);
      });
      await t.test("move, same-stage no-op, removal and independent LeadStatus", async () => {
        const count = () => prisma.activity.count({ where: { entityType: "LEAD", entityId: lead.id, action: "PIPELINE_STAGE_CHANGED" } });
        const stageId = pipeline.stages[0].id;
        assert.equal((await request(movePath(), { method: "PATCH", body: { stageId } })).status, 200);
        assert.equal(await count(), 1);
        assert.equal((await request(movePath(), { method: "PATCH", body: { stageId } })).body.changed, false);
        assert.equal(await count(), 1);
        assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "QUALIFIED");
        const board = (await request(`/api/pipelines/${pipeline.id}/board`)).body;
        assert.deepEqual(board.stages[0].leads.map(({ id }) => id), [lead.id]);
        assert.equal(board.unassignedLeads.some(({ id }) => id === lead.id), false);
        assert.equal((await request(movePath(), { method: "PATCH", body: { stageId: null } })).status, 200);
        assert.equal(await count(), 2);
        assert.equal(await prisma.leadPipelinePosition.count({ where: { leadId: lead.id } }), 0);
        await request(movePath(), { method: "PATCH", body: { stageId } });
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "LOST" } });
        assert.equal((await prisma.leadPipelinePosition.findUnique({ where: { leadId: lead.id } })).pipelineStageId, stageId);
      });
      await t.test("all foreign resources and cross-pipeline stages are rejected", async () => {
        for (const method of ["GET", "PATCH", "DELETE"]) assert.equal((await request(`/api/pipelines/${foreignPipeline.id}`, { method, body: method === "PATCH" ? { name: "Attack" } : undefined })).status, 404);
        assert.equal((await request(`/api/pipelines/${foreignPipeline.id}/board`)).status, 404);
        for (const stageId of [foreignPipeline.stages[0].id, alternate.stages[0].id]) assert.equal((await request(movePath(), { method: "PATCH", body: { stageId } })).status, 404);
        assert.equal((await request(`/api/pipelines/${pipeline.id}/leads/${foreignLead.id}/stage`, { method: "PATCH", body: { stageId: pipeline.stages[0].id } })).status, 404);
        for (const method of ["PATCH", "DELETE"]) assert.equal((await request(`/api/pipelines/${pipeline.id}/stages/${foreignPipeline.stages[0].id}`, { method, body: method === "PATCH" ? { name: "Attack" } : undefined })).status, 404);
        assert.equal((await request(`/api/pipelines/${pipeline.id}`, { method: "PATCH", body: { stages: [{ id: foreignPipeline.stages[0].id, name: "Attack" }] } })).status, 404);
      });
      await t.test("occupied stage/pipeline deletion returns 409 without data loss", async () => {
        assert.equal((await request(`/api/pipelines/${pipeline.id}/stages/${pipeline.stages[0].id}`, { method: "DELETE" })).status, 409);
        assert.equal((await request(`/api/pipelines/${pipeline.id}`, { method: "DELETE" })).status, 409);
        const before = (await request(`/api/pipelines/${pipeline.id}`)).body;
        const reduced = before.stages.slice(1).map(({ id, name }) => ({ id, name }));
        assert.equal((await request(`/api/pipelines/${pipeline.id}`, { method: "PATCH", body: { name: "Should rollback", stages: reduced } })).status, 409);
        assert.equal((await request(`/api/pipelines/${pipeline.id}`)).body.name, "Sales");
        assert.equal(await prisma.leadPipelinePosition.count({ where: { leadId: lead.id } }), 1);
      });
      await t.test("stage create/rename/reorder/delete normalizes unique positions atomically", async () => {
        const created = await request(`/api/pipelines/${pipeline.id}/stages`, { method: "POST", body: { name: "Custom" } });
        assert.equal(created.status, 201);
        const stage = created.body.stages.at(-1);
        assert.equal((await request(`/api/pipelines/${pipeline.id}/stages/${stage.id}`, { method: "PATCH", body: { name: "Renamed" } })).status, 200);
        const ids = created.body.stages.map(({ id }) => id).reverse();
        const reordered = await request(`/api/pipelines/${pipeline.id}/stages/reorder`, { method: "PATCH", body: { stageIds: ids } });
        assert.equal(reordered.status, 200);
        assert.deepEqual(reordered.body.stages.map(({ id }) => id), ids);
        assert.equal((await request(`/api/pipelines/${pipeline.id}/stages/reorder`, { method: "PATCH", body: { stageIds: ids.slice(1) } })).status, 400);
        const deleted = await request(`/api/pipelines/${pipeline.id}/stages/${stage.id}`, { method: "DELETE" });
        assert.equal(deleted.status, 200);
        assert.deepEqual(deleted.body.stages.map(({ position }) => position), [1, 2, 3, 4, 5, 6, 7]);
        const updated = await request(`/api/pipelines/${pipeline.id}`, { method: "PATCH", body: { name: "Renamed pipeline" } });
        assert.equal(updated.body.stages.length, 7);
        assert.equal(updated.body.isDefault, true);
      });
      await t.test("strict validation, IDs and repeated board filters", async () => {
        for (const body of [{ name: " " }, { name: 1 }, { name: null }, { isDefault: "true" }, { stages: [] }, { stages: [{ name: "Stage", id: "1" }] }, { organizationId: other.id }]) {
          assert.equal((await request(`/api/pipelines/${pipeline.id}`, { method: "PATCH", body })).status, 400);
        }
        for (const body of [{ stageId: "1" }, { stageId: false }, { stageId: 0 }, {}, { stageId: null, name: "Attack" }]) assert.equal((await request(movePath(), { method: "PATCH", body })).status, 400);
        for (const id of ["0", "-1", "1e0", "1.0"]) assert.equal((await request(`/api/pipelines/${id}`)).status, 400);
        for (const query of ["assignedMemberId=", "assignedMemberId=1&assignedMemberId=2", "search=a&search=b"]) assert.equal((await request(`/api/pipelines/${pipeline.id}/board?${query}`)).status, 400);
        assert.deepEqual((await request(`/api/pipelines/${pipeline.id}/board?search=company&assignedMemberId=${admin.membership.id}`)).body.stages.flatMap((stage) => stage.leads).map(({ id }) => id), [lead.id]);
      });
      await t.test("permission matrix and Lead data is unavailable without LEADS_VIEW", async () => {
        assert.equal((await request("/api/pipelines", { token: null })).status, 401);
        await perms([]);
        assert.equal((await request("/api/pipelines", { token: userToken })).status, 403);
        await perms(["PIPELINE_VIEW"]);
        assert.equal((await request("/api/pipelines", { token: userToken })).status, 200);
        assert.equal((await request(`/api/pipelines/${pipeline.id}/board`, { token: userToken })).status, 403);
        await perms(["PIPELINE_VIEW", "LEADS_VIEW"]);
        assert.equal((await request(`/api/pipelines/${pipeline.id}/board`, { token: userToken })).status, 200);
        for (const [method, path, body] of [["POST", "/api/pipelines", { name: "Denied" }], ["PATCH", `/api/pipelines/${alternate.id}`, { name: "Denied" }], ["DELETE", `/api/pipelines/${alternate.id}`, undefined], ["PATCH", movePath(), { stageId: null }]]) assert.equal((await request(path, { token: userToken, method, body })).status, 403);
        await perms(["PIPELINE_CREATE"]);
        const created = await request("/api/pipelines", { token: userToken, method: "POST", body: { name: "User create" } });
        assert.equal(created.status, 201);
        await perms(["PIPELINE_EDIT"]);
        assert.equal((await request(movePath(), { token: userToken, method: "PATCH", body: { stageId: null } })).status, 403);
        assert.equal((await request(`/api/pipelines/${pipeline.id}`, { token: userToken, method: "PATCH", body: { name: "User edit" } })).status, 200);
        const definition = await service.getPipeline({ organizationId: org.id, pipelineId: pipeline.id });
        assert.equal((await request(`/api/pipelines/${pipeline.id}`, { token: userToken, method: "PATCH", body: { stages: definition.stages.slice(1).map(({ id, name }) => ({ id, name })) } })).status, 403);
        await perms(["PIPELINE_EDIT", "LEADS_VIEW"]);
        assert.equal((await request(movePath(), { token: userToken, method: "PATCH", body: { stageId: null } })).status, 200);
        await perms(["PIPELINE_DELETE"]);
        assert.equal((await request(`/api/pipelines/${created.body.id}`, { token: userToken, method: "DELETE" })).status, 200);
        assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
      });
      await t.test("Activity visibility requires both domains and filters before limit", async () => {
        for (const permissions of [["ACTIVITY_VIEW"], ["ACTIVITY_VIEW", "LEADS_VIEW"], ["ACTIVITY_VIEW", "PIPELINE_VIEW"]]) {
          await perms(permissions);
          assert.deepEqual((await request("/api/activities?action=PIPELINE_STAGE_CHANGED", { token: userToken })).body, []);
        }
        await perms(["ACTIVITY_VIEW", "LEADS_VIEW", "PIPELINE_VIEW"]);
        assert.ok((await request("/api/activities?action=PIPELINE_STAGE_CHANGED", { token: userToken })).body.length);
        for (const module of ["PIPELINE", "LEADS"]) {
          await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: false } });
          assert.equal((await request(`/api/pipelines/${pipeline.id}/board`)).status, 403);
          assert.equal((await request(movePath(), { method: "PATCH", body: { stageId: pipeline.stages[0].id } })).status, 403);
          assert.deepEqual((await request("/api/activities?action=PIPELINE_STAGE_CHANGED", { token: userToken })).body, []);
          assert.equal((await request("/api/pipelines")).status, module === "PIPELINE" ? 403 : 200);
          await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: true } });
        }
        await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: org.id, module: "PIPELINE" } } });
        assert.equal((await request("/api/pipelines")).status, 403);
        await prisma.organizationModule.create({ data: { organizationId: org.id, module: "PIPELINE", enabled: true } });
      });
      await t.test("Activity failure rolls back the complete move", async () => {
        const failing = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
          if (key === "activity") return { create: async () => { throw new Error("Activity failure"); } };
          const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
        } }))) };
        const before = await prisma.leadPipelinePosition.findUnique({ where: { leadId: lead.id } });
        await assert.rejects(service.moveLead({ organizationId: org.id, actorMemberId: owner.membership.id, pipelineId: pipeline.id, leadId: lead.id, stageId: pipeline.stages[0].id }, failing), /Activity failure/);
        assert.deepEqual(await prisma.leadPipelinePosition.findUnique({ where: { leadId: lead.id } }), before);
      });
      await t.test("concurrent moves cannot put a Lead in two pipelines or duplicate events", async () => {
        const args = { organizationId: org.id, actorMemberId: owner.membership.id, leadId: secondLead.id };
        const results = await Promise.allSettled([
          service.moveLead({ ...args, pipelineId: pipeline.id, stageId: pipeline.stages[0].id }),
          service.moveLead({ ...args, pipelineId: alternate.id, stageId: alternate.stages[0].id }),
        ]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.find((result) => result.status === "rejected").reason.statusCode, 409);
        assert.equal(await prisma.leadPipelinePosition.count({ where: { leadId: secondLead.id } }), 1);
        const position = await prisma.leadPipelinePosition.findUnique({ where: { leadId: secondLead.id } });
        const repeat = { ...args, pipelineId: position.pipelineId, stageId: position.pipelineStageId };
        await Promise.all([service.moveLead(repeat), service.moveLead(repeat)]);
        assert.equal(await prisma.activity.count({ where: { entityId: secondLead.id, entityType: "LEAD", action: "PIPELINE_STAGE_CHANGED" } }), 1);
        await service.moveLead({ ...repeat, stageId: null });
      });
      await t.test("default selection concurrency and composite DB constraints", async () => {
        await Promise.all(Array.from({ length: 3 }, (_, index) => service.createPipeline({ organizationId: org.id, data: { name: "Concurrent " + index, isDefault: true } })));
        assert.equal(await prisma.pipeline.count({ where: { organizationId: org.id, isDefault: true } }), 1);
        await assert.rejects(prisma.pipeline.create({ data: { organizationId: org.id, name: "Duplicate default", isDefault: true } }), (error) => error.code === "P2002");
        await assert.rejects(prisma.leadPipelinePosition.create({ data: { organizationId: org.id, leadId: foreignLead.id, pipelineId: pipeline.id, pipelineStageId: pipeline.stages[0].id } }), (error) => error.code === "P2003");
        await assert.rejects(prisma.leadPipelinePosition.create({ data: { organizationId: org.id, leadId: secondLead.id, pipelineId: pipeline.id, pipelineStageId: alternate.stages[0].id } }), (error) => error.code === "P2003");
        await assert.rejects(prisma.pipelineStage.create({ data: { organizationId: other.id, pipelineId: pipeline.id, name: "Bad tenant", position: 100 } }), (error) => error.code === "P2003");
        await assert.rejects(prisma.pipelineStage.create({ data: { organizationId: org.id, pipelineId: pipeline.id, name: "Duplicate position", position: 1 } }), (error) => error.code === "P2002");
      });
      await t.test("empty pipeline deletion and default promotion are consistent", async () => {
        const created = await service.createPipeline({ organizationId: org.id, data: { name: "Delete default", isDefault: true } });
        assert.equal((await request(`/api/pipelines/${created.id}`, { method: "DELETE" })).status, 200);
        assert.equal(await prisma.pipeline.count({ where: { organizationId: org.id, isDefault: true } }), 1);
      });
      await t.test("maximum supported stage list reorders without timeout or duplicate positions", async () => {
        const large = await service.createPipeline({ organizationId: org.id, data: { name: "Large configuration", stages: Array.from({ length: 100 }, (_, index) => ({ name: "Stage " + index })) } });
        const reversed = large.stages.map(({ id }) => id).reverse();
        const reordered = await service.mutateStage({ organizationId: org.id, pipelineId: large.id, kind: "reorder", data: { stageIds: reversed } });
        assert.deepEqual(reordered.stages.map(({ id }) => id), reversed);
        assert.deepEqual(reordered.stages.map(({ position }) => position), Array.from({ length: 100 }, (_, index) => index + 1));
      });
    } finally {
      server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
      if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
    }
    await t.test("backfill and centralized defaults preserve existing Leads and OWNER implicit", async () => {
      const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");
      const { initializeMemberPermissions, getEffectivePermissions } = await import("../src/services/permissionService.js");
      const fresh = await prisma.organization.create({ data: { name: "Backfill", slug: schema + "_backfill" } });
      const freshMember = await member("USER", fresh.id);
      const untouched = await prisma.lead.create({ data: { organizationId: fresh.id, name: "Unassigned existing", status: "CONTACTED" } });
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "PIPELINE" } }, data: { enabled: false } });
      await prisma.organizationMemberPermission.deleteMany();
      const sql = await readFile("prisma/migrations/20260913120000_add_pipeline/migration.sql", "utf8");
      const connection = await pool.connect();
      try {
        await connection.query(`SET search_path TO "${schema}"`);
        const backfill = sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"'));
        await connection.query(backfill); await connection.query(backfill);
      } finally { connection.release(); }
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "PIPELINE" } } })).enabled, false);
      const defaults = await service.getPipelines({ organizationId: fresh.id });
      assert.equal(defaults.length, 1); assert.equal(defaults[0].stages.length, 7);
      assert.equal(await prisma.leadPipelinePosition.count({ where: { leadId: untouched.id } }), 0);
      assert.equal((await prisma.lead.findUnique({ where: { id: untouched.id } })).status, "CONTACTED");
      for (const membership of [admin.membership, user.membership, freshMember.membership]) {
        const permissions = await getEffectivePermissions(membership);
        assert.deepEqual(permissions.sort(), ["PIPELINE_CREATE", "PIPELINE_DELETE", "PIPELINE_EDIT", "PIPELINE_VIEW"]);
      }
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
      const newOrg = await prisma.organization.create({ data: { name: "New defaults", slug: schema + "_new" } });
      await initializeOrganizationModules(newOrg.id);
      await initializeOrganizationModules(newOrg.id);
      assert.equal((await service.getPipelines({ organizationId: newOrg.id })).length, 1);
      const newUser = await member("USER", newOrg.id);
      await initializeMemberPermissions(newUser.membership.id, "USER");
      assert.ok((await getEffectivePermissions(newUser.membership)).includes("PIPELINE_EDIT"));
    });
  } finally {
    if (prisma) await prisma.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
