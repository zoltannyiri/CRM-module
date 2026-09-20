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
test("Leads real database CRUD, authorization and migration", {
  skip: process.env.LEADS_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `leads_audit_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^leads_audit_[a-f0-9]{32}$/);
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
    const { default: leads } = await import("../src/services/leadService.js");
    const { default: leadRoutes } = await import("../src/routes/leadRoutes.js");
    const { default: partnerRoutes } = await import("../src/routes/partnerRoutes.js");
    const { default: activityRoutes } = await import("../src/routes/activityRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const org = await prisma.organization.create({ data: { name: "Leads audit", slug: schema } });
    const other = await prisma.organization.create({ data: { name: "Foreign", slug: schema + "_other" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "LEADS", enabled: true } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "PARTNERS", enabled: true } });
    const makeMember = async (role, organizationId = org.id) => {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId, role } });
      return { user, membership };
    };
    const owner = await makeMember("OWNER");
    const admin = await makeMember("ADMIN");
    const user = await makeMember("USER");
    const foreignMember = await makeMember("OWNER", other.id);
    const foreign = await prisma.lead.create({ data: { organizationId: other.id, name: "Secret lead" } });
    const secret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    const app = express();
    app.use(express.json());
    app.use("/api/leads", leadRoutes);
    app.use("/api/partners", partnerRoutes);
    app.use("/api/activities", activityRoutes);
    app.use((error, _req, res, _next) => {
      const status = error.statusCode || 500;
      return res.status(status).json({ message: status >= 500 ? "Audit technical error" : error.message, ...(status < 500 && error.code && { code: error.code }) });
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const ownerToken = generateAccessToken(owner.user);
    const userToken = generateAccessToken(user.user);
    const request = async (path, { token = ownerToken, method = "GET", body } = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { "Content-Type": "application/json" }) }, body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    const setPermissions = async (values) => {
      await prisma.organizationMemberPermission.deleteMany({ where: { organizationMemberId: user.membership.id } });
      if (values.length) await prisma.organizationMemberPermission.createMany({ data: values.map((permission) => ({ organizationMemberId: user.membership.id, permission })) });
    };
    let own;
    try {
      await t.test("CRUD create/show/list, filters and minimal member response", async () => {
        const result = await request("/api/leads", { method: "POST", body: { name: "Lead Zoltán", companyName: "Company", email: "lead@example.com", phone: "+36701234567", status: "NEW", source: "WEBSITE", assignedMemberId: admin.membership.id, note: "Note" } });
        assert.equal(result.status, 201);
        own = result.body;
        assert.deepEqual(own.assignedMember, { id: admin.membership.id, user: { firstName: "Audit", lastName: "ADMIN" } });
        assert.deepEqual(own.createdByMember, { user: { firstName: "Audit", lastName: "OWNER" } });
        assert.equal(Object.hasOwn(own, "organizationId"), false);
        assert.equal(Object.hasOwn(own, "createdByMemberId"), false);
        assert.equal((await request(`/api/leads/${own.id}`)).body.name, own.name);
        for (const search of ["Zoltán", "Company", "lead@example", "701234"]) {
          const filtered = await request(`/api/leads?status=NEW&source=WEBSITE&assignedMemberId=${admin.membership.id}&search=${encodeURIComponent(search)}&sortDirection=asc`);
          assert.deepEqual(filtered.body.map(({ id }) => id), [own.id]);
        }
        const required = await request("/api/leads", { method: "POST", body: { name: "Only name" } });
        assert.equal(required.status, 201);
        assert.equal(required.body.status, "NEW");
        assert.equal(required.body.source, "OTHER");
        assert.equal(required.body.assignedMemberId, null);
      });
      await t.test("createdAt sorting overrides ID order with stable ties in both directions", async () => {
        const fixture = { organizationId: org.id, name: "Sorting fixture", status: "QUALIFIED", source: "SOCIAL", assignedMemberId: admin.membership.id };
        const newest = await prisma.lead.create({ data: { ...fixture, createdAt: new Date("2026-03-01T00:00:00Z") } });
        const oldest = await prisma.lead.create({ data: { ...fixture, createdAt: new Date("2026-01-01T00:00:00Z") } });
        const tieOne = await prisma.lead.create({ data: { ...fixture, createdAt: new Date("2026-02-01T00:00:00Z") } });
        const tieTwo = await prisma.lead.create({ data: { ...fixture, createdAt: tieOne.createdAt } });
        await prisma.lead.create({ data: { ...fixture, organizationId: other.id, assignedMemberId: null, createdAt: oldest.createdAt } });
        for (const [direction, expected] of [
          ["asc", [oldest.id, tieOne.id, tieTwo.id, newest.id]],
          ["desc", [newest.id, tieTwo.id, tieOne.id, oldest.id]],
        ]) {
          const result = await request(`/api/leads?search=Sorting&status=QUALIFIED&source=SOCIAL&assignedMemberId=${admin.membership.id}&sortDirection=${direction}`);
          assert.equal(result.status, 200);
          assert.deepEqual(result.body.map(({ id }) => id), expected);
        }
      });
      await t.test("tenant isolation denies foreign show/edit/delete and assignment", async () => {
        assert.equal((await request("/api/leads")).body.some(({ id }) => id === foreign.id), false);
        for (const method of ["GET", "PATCH", "DELETE"]) assert.equal((await request(`/api/leads/${foreign.id}`, { method, body: method === "PATCH" ? { name: "Changed" } : undefined })).status, 404);
        assert.equal((await request("/api/leads", { method: "POST", body: { name: "Bad", assignedMemberId: foreignMember.membership.id } })).status, 404);
        assert.equal((await request(`/api/leads/${own.id}`, { method: "PATCH", body: { assignedMemberId: foreignMember.membership.id } })).status, 404);
        assert.deepEqual((await request(`/api/leads?assignedMemberId=${foreignMember.membership.id}`)).body, []);
        assert.equal((await prisma.lead.findUnique({ where: { id: foreign.id } })).name, "Secret lead");
      });
      await t.test("invalid payloads, empty and repeated filters return controlled 400", async () => {
        for (const filter of ["status=", "status=INVALID", "status=NEW&status=LOST", "source=", "source=INVALID", "source=EMAIL&source=PHONE", "assignedMemberId=", "assignedMemberId=true", "assignedMemberId=1e0", "assignedMemberId=1&assignedMemberId=2", "search=x&search=y", "sortDirection=invalid"]) assert.equal((await request("/api/leads?" + filter)).status, 400, filter);
        for (const body of [{ status: "" }, { status: null }, { source: "invalid" }, { source: false }, { email: "invalid" }, { phone: "x" }, { note: {} }, { assignedMemberId: "1" }, { name: "" }, { organizationId: other.id }]) {
          assert.equal((await request(`/api/leads/${own.id}`, { method: "PATCH", body })).status, 400);
          assert.equal((await request("/api/leads", { method: "POST", body: { name: "Invalid", ...body } })).status, 400);
        }
      });
      await t.test("PATCH preserves omitted fields, clears nulls and emits only real changes", async () => {
        const updated = await request(`/api/leads/${own.id}`, { method: "PATCH", body: { status: "CONTACTED", source: "REFERRAL", note: "Updated", assignedMemberId: user.membership.id } });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.companyName, "Company");
        assert.equal(updated.body.email, own.email);
        const count = await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id } });
        assert.equal((await request(`/api/leads/${own.id}`, { method: "PATCH", body: { assignedMemberId: user.membership.id } })).status, 200);
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id } }), count);
        const cleared = await request(`/api/leads/${own.id}`, { method: "PATCH", body: { assignedMemberId: null, companyName: null, email: null, phone: null, note: null } });
        assert.equal(cleared.body.status, "CONTACTED");
        assert.equal(cleared.body.source, "REFERRAL");
        for (const field of ["assignedMemberId", "companyName", "email", "phone", "note"]) assert.equal(cleared.body[field], null);
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id, action: "STATUS_CHANGED" } }), 1);
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id, action: "ASSIGNED" } }), 3);
      });
      await t.test("endpoint auth and VIEW/CREATE/EDIT/DELETE permission matrix", async () => {
        assert.equal((await request("/api/leads", { token: null })).status, 401);
        await setPermissions([]);
        assert.equal((await request("/api/leads", { token: userToken })).status, 403);
        await setPermissions(["LEADS_VIEW"]);
        assert.equal((await request("/api/leads", { token: userToken })).status, 200);
        for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await request(method === "POST" ? "/api/leads" : `/api/leads/${own.id}`, { token: userToken, method, body: { name: "Denied" } })).status, 403);
        await setPermissions(["LEADS_VIEW", "LEADS_CREATE"]);
        assert.equal((await request("/api/leads", { token: userToken, method: "POST", body: { name: "Allowed" } })).status, 201);
        await setPermissions(["LEADS_VIEW", "LEADS_EDIT"]);
        assert.equal((await request(`/api/leads/${own.id}`, { token: userToken, method: "PATCH", body: { name: "Edited" } })).status, 200);
        assert.equal((await request(`/api/leads/${own.id}`, { token: userToken, method: "DELETE" })).status, 403);
      });
      await t.test("activity visibility requires both permissions and enabled module; missing module is disabled", async () => {
        await setPermissions(["ACTIVITY_VIEW"]);
        assert.deepEqual((await request("/api/activities?entityType=LEAD", { token: userToken })).body, []);
        await setPermissions(["LEADS_VIEW"]);
        assert.equal((await request("/api/activities?entityType=LEAD", { token: userToken })).status, 403);
        await setPermissions(["ACTIVITY_VIEW", "LEADS_VIEW"]);
        const result = await request("/api/activities?entityType=LEAD", { token: userToken });
        assert.ok(result.body.length);
        assert.ok(result.body.every((a) => a.organizationId === org.id && a.entityId !== foreign.id));
        for (const missing of [false, true]) {
          if (missing) await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } } });
          else await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } }, data: { enabled: false } });
          for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await request(method === "GET" || method === "POST" ? "/api/leads" : `/api/leads/${own.id}`, { method, body: method !== "GET" ? { name: "Denied" } : undefined })).status, 403);
          assert.deepEqual((await request("/api/activities?entityType=LEAD", { token: userToken })).body, []);
        }
        await prisma.organizationModule.create({ data: { organizationId: org.id, module: "LEADS", enabled: true } });
      });
      await t.test("activity failure atomically rolls back create/update/delete", async () => {
        const failing = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
          if (key === "activity") return { create: async () => { throw new Error("Activity failure"); } };
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        } }))) };
        const args = { organizationId: org.id, actorMemberId: owner.membership.id, leadId: own.id };
        const before = await prisma.lead.findUnique({ where: { id: own.id } });
        const count = await prisma.lead.count();
        await assert.rejects(leads.createLead({ ...args, data: { name: "Rollback" } }, failing), /Activity failure/);
        assert.equal(await prisma.lead.count(), count);
        await assert.rejects(leads.updateLead({ ...args, data: { name: "Rollback" } }, failing), /Activity failure/);
        await assert.rejects(leads.deleteLead(args, failing), /Activity failure/);
        assert.deepEqual(await prisma.lead.findUnique({ where: { id: own.id } }), before);
      });
      await t.test("concurrent identical assignments produce a single assignment change", async () => {
        const before = await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id, action: "ASSIGNED" } });
        const args = { organizationId: org.id, actorMemberId: owner.membership.id, leadId: own.id, data: { assignedMemberId: admin.membership.id } };
        const results = await Promise.all([leads.updateLead(args), leads.updateLead(args)]);
        assert.ok(results.every((lead) => lead.assignedMemberId === admin.membership.id));
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id, action: "ASSIGNED" } }), before + 1);
      });
      await t.test("conversion enforces permissions, both modules, tenant and strict Partner payload", async () => {
        const candidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Conversion candidate", companyName: "Candidate Kft.", email: "candidate@example.com" } });
        const conversion = { partner: { type: "COMPANY", name: "Candidate Kft.", email: "candidate@example.com" } };
        await setPermissions(["LEADS_CONVERT"]);
        assert.equal((await request(`/api/leads/${candidate.id}/convert`, { token: userToken, method: "POST", body: conversion })).status, 403);
        await setPermissions(["PARTNERS_CREATE"]);
        assert.equal((await request(`/api/leads/${candidate.id}/convert`, { token: userToken, method: "POST", body: conversion })).status, 403);
        await setPermissions(["LEADS_CONVERT", "PARTNERS_CREATE"]);
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } }, data: { enabled: false } });
        assert.equal((await request(`/api/leads/${candidate.id}/convert`, { token: userToken, method: "POST", body: conversion })).status, 403);
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } }, data: { enabled: true } });
        assert.equal((await request(`/api/leads/${foreign.id}/convert`, { token: userToken, method: "POST", body: conversion })).status, 404);
        for (const body of [null, {}, { partner: null }, { partner: { name: "" } }, { partner: { name: "X", organizationId: other.id } }, { partner: { name: "X", createdByMemberId: owner.membership.id } }, { partner: { name: "X", type: "INVALID" } }]) {
          assert.equal((await request(`/api/leads/${candidate.id}/convert`, { token: userToken, method: "POST", body })).status, 400);
        }
        const converted = await request(`/api/leads/${candidate.id}/convert`, { token: userToken, method: "POST", body: conversion });
        assert.equal(converted.status, 201);
        assert.equal(Object.hasOwn(converted.body, "partner"), false);
        assert.equal(Object.hasOwn(converted.body.lead, "convertedPartner"), false);
        assert.ok(converted.body.lead.convertedAt);
      });
      await t.test("conversion is atomic, concurrent-safe and has exactly two domain activities", async () => {
        const candidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Parallel", companyName: "Parallel Kft." } });
        const before = await prisma.partner.count({ where: { organizationId: org.id } });
        const body = { partner: { type: "COMPANY", name: "Parallel Kft." } };
        const results = await Promise.all([
          request(`/api/leads/${candidate.id}/convert`, { method: "POST", body }),
          request(`/api/leads/${candidate.id}/convert`, { method: "POST", body }),
        ]);
        assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
        assert.equal(results.find(({ status }) => status === 409).body.code, "LEAD_ALREADY_CONVERTED");
        assert.equal(await prisma.partner.count({ where: { organizationId: org.id } }), before + 1);
        const stored = await prisma.lead.findUnique({ where: { id: candidate.id } });
        assert.ok(stored.convertedAt); assert.ok(stored.convertedPartnerId); assert.equal(stored.convertedByMemberId, owner.membership.id);
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: candidate.id, action: "LEAD_CONVERTED" } }), 1);
        assert.equal(await prisma.activity.count({ where: { entityType: "PARTNER", entityId: stored.convertedPartnerId, action: "CREATED" } }), 1);

        const failingCandidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Rollback conversion" } });
        const partnerCount = await prisma.partner.count();
        let activityWrites = 0;
        const failing = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
          if (key === "activity") return { create: async (...parameters) => {
            activityWrites += 1;
            if (activityWrites === 2) throw new Error("Activity failure");
            return target.activity.create(...parameters);
          } };
          const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
        } }))) };
        await assert.rejects(leads.convertLead({ organizationId: org.id, actorMemberId: owner.membership.id, leadId: failingCandidate.id, partner: { type: "COMPANY", name: "Orphan forbidden" } }, failing), /Activity failure/);
        assert.equal(await prisma.partner.count(), partnerCount);
        assert.equal((await prisma.lead.findUnique({ where: { id: failingCandidate.id } })).convertedAt, null);
      });
      await t.test("conversion preserves Pipeline and Follow-ups; delete lifecycles preserve history and Partner", async () => {
        const pipeline = await prisma.pipeline.create({ data: { organizationId: org.id, name: "Conversion pipeline", stages: { create: { name: "Stage", position: 0 } } }, include: { stages: true } });
        const candidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Lifecycle" } });
        await prisma.leadPipelinePosition.create({ data: { organizationId: org.id, leadId: candidate.id, pipelineId: pipeline.id, pipelineStageId: pipeline.stages[0].id } });
        const followUp = await prisma.followUp.create({ data: { organizationId: org.id, leadId: candidate.id, type: "CALL", status: "OPEN", dueAt: new Date("2026-10-01T10:00:00Z") } });
        const result = await request(`/api/leads/${candidate.id}/convert`, { method: "POST", body: { partner: { name: "Lifecycle partner" } } });
        assert.equal(result.status, 201);
        const stored = await prisma.lead.findUnique({ where: { id: candidate.id } });
        assert.equal((await prisma.leadPipelinePosition.findUnique({ where: { leadId: candidate.id } })).pipelineStageId, pipeline.stages[0].id);
        assert.equal((await prisma.followUp.findUnique({ where: { id: followUp.id } })).status, "OPEN");
        const partnerId = stored.convertedPartnerId;
        await assert.rejects(prisma.lead.update({ where: { id: candidate.id }, data: { convertedPartnerId: await prisma.partner.create({ data: { organizationId: other.id, name: "Foreign conversion target" } }).then(({ id }) => id) } }));
        await assert.rejects(prisma.lead.update({ where: { id: candidate.id }, data: { convertedByMemberId: foreignMember.membership.id } }));
        await prisma.partner.delete({ where: { id: partnerId } });
        const afterPartnerDelete = await prisma.lead.findUnique({ where: { id: candidate.id } });
        assert.ok(afterPartnerDelete.convertedAt); assert.equal(afterPartnerDelete.convertedPartnerId, null);

        const deleteCandidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Delete converted Lead" } });
        const converted = await leads.convertLead({ organizationId: org.id, actorMemberId: owner.membership.id, leadId: deleteCandidate.id, partner: { type: "PERSON", name: "Surviving partner" } });
        const survivingPartnerId = converted.partner?.id || (await prisma.lead.findUnique({ where: { id: deleteCandidate.id } })).convertedPartnerId;
        await leads.deleteLead({ organizationId: org.id, actorMemberId: owner.membership.id, leadId: deleteCandidate.id });
        assert.ok(await prisma.partner.findUnique({ where: { id: survivingPartnerId } }));

        const converter = await makeMember("USER");
        const actorCandidate = await prisma.lead.create({ data: { organizationId: org.id, name: "Actor lifecycle" } });
        await leads.convertLead({ organizationId: org.id, actorMemberId: converter.membership.id, leadId: actorCandidate.id, partner: { type: "PERSON", name: "Actor partner" } });
        await prisma.organizationMember.delete({ where: { id: converter.membership.id } });
        const afterMemberDelete = await prisma.lead.findUnique({ where: { id: actorCandidate.id } });
        assert.ok(afterMemberDelete.convertedAt); assert.equal(afterMemberDelete.convertedByMemberId, null);
      });
      await t.test("normal Partner create remains strict and functional", async () => {
        await setPermissions(["PARTNERS_CREATE"]);
        assert.equal((await request("/api/partners", { token: userToken, method: "POST", body: { name: " Normal partner ", type: "COMPANY" } })).status, 201);
        for (const body of [{ name: "" }, { name: "X", organizationId: org.id }, { name: "X", email: "invalid" }]) {
          assert.equal((await request("/api/partners", { token: userToken, method: "POST", body })).status, 400);
        }
      });
      await t.test("authorized delete removes lead and records activity", async () => {
        await setPermissions(["LEADS_VIEW", "LEADS_DELETE"]);
        assert.equal((await request(`/api/leads/${own.id}`, { token: userToken, method: "DELETE" })).status, 200);
        assert.equal((await request(`/api/leads/${own.id}`)).status, 404);
        assert.equal(await prisma.activity.count({ where: { entityType: "LEAD", entityId: own.id, action: "DELETED" } }), 1);
      });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (secret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = secret;
    }
    await t.test("module/permission backfill is idempotent, preserves disabled and OWNER implicit", async () => {
      await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } } });
      await prisma.organizationMemberPermission.deleteMany();
      const sql = await readFile("prisma/migrations/20260912120000_add_leads/migration.sql", "utf8");
      const connection = await pool.connect();
      try {
        await connection.query(`SET search_path TO "${schema}"`);
        await connection.query(sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"')));
        assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } } })).enabled, true);
        for (const member of [admin, user]) {
          const records = await prisma.organizationMemberPermission.findMany({ where: { organizationMemberId: member.membership.id } });
          assert.deepEqual(records.map(({ permission }) => permission).sort(), ["LEADS_CREATE", "LEADS_DELETE", "LEADS_EDIT", "LEADS_VIEW"]);
        }
        assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } }, data: { enabled: false } });
        await connection.query(sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"')));
        assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "LEADS" } } })).enabled, false);
      } finally { connection.release(); }
    });
    await t.test("conversion permission backfill is idempotent and leaves OWNER implicit", async () => {
      await prisma.organizationMemberPermission.deleteMany({ where: { permission: "LEADS_CONVERT" } });
      const sql = await readFile("prisma/migrations/20260920090100_add_lead_conversion/migration.sql", "utf8");
      const backfill = sql.slice(sql.indexOf('INSERT INTO "OrganizationMemberPermission"'));
      const connection = await pool.connect();
      try {
        await connection.query(`SET search_path TO "${schema}"`);
        await connection.query(backfill); await connection.query(backfill);
      } finally { connection.release(); }
      for (const member of [admin, user]) assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: member.membership.id, permission: "LEADS_CONVERT" } }), 1);
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id, permission: "LEADS_CONVERT" } }), 0);
    });
    await t.test("new organizations and members receive centralized Leads defaults", async () => {
      const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");
      const { initializeMemberPermissions, getEffectivePermissions } = await import("../src/services/permissionService.js");
      const fresh = await prisma.organization.create({ data: { name: "Fresh", slug: schema + "_fresh" } });
      await initializeOrganizationModules(fresh.id);
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: fresh.id, module: "LEADS" } } })).enabled, true);
      for (const role of ["OWNER", "ADMIN", "USER"]) {
        const member = await makeMember(role, fresh.id);
        await initializeMemberPermissions(member.membership.id, role);
        const effective = await getEffectivePermissions(member.membership);
        assert.ok(["LEADS_VIEW", "LEADS_CREATE", "LEADS_EDIT", "LEADS_DELETE", "LEADS_CONVERT"].every((key) => effective.includes(key)));
        if (role === "OWNER") assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: member.membership.id } }), 0);
      }
    });
  } finally {
    if (prisma) await prisma.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
