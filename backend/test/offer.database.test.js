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

// Opt-in. Runs all migrations and real concurrent creates in an isolated schema.
// No existing application rows are read or changed; the scratch schema is dropped.
test("Offers real database migration, concurrency and integrity", {
  skip: process.env.OFFERS_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `offers_audit_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^offers_audit_[a-f0-9]{32}$/);
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
    const { createOffer, updateOffer, deleteOffer } = await import("../src/services/offerService.js");
    const org = await prisma.organization.create({ data: { name: "Offers audit", slug: schema } });
    await prisma.organizationModule.createMany({ data: ["PARTNERS", "PROJECTS", "OFFERS"].map((module) => ({ organizationId: org.id, module, enabled: true })) });
    const partner = await prisma.partner.create({ data: { organizationId: org.id, name: "Audit partner" } });
    const project = await prisma.project.create({ data: { organizationId: org.id, name: "Audit project" } });
    const makeMember = async (role) => {
      const user = await prisma.user.create({ data: { email: `${role.toLowerCase()}@${schema}.invalid`, passwordHash: "unused", firstName: "Audit", lastName: role } });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId: org.id, role } });
      return { user, membership };
    };
    const owner = await makeMember("OWNER");
    const admin = await makeMember("ADMIN");
    const user = await makeMember("USER");
    const data = { partnerId: partner.id, projectId: project.id, status: "DRAFT", issueDate: new Date("2026-09-12T00:00:00Z"), validUntil: new Date("2026-10-12T00:00:00Z"), currency: "HUF", note: null,
      items: [{ name: "Audit item", quantity: "1", unit: "db", unitPrice: "0.01", vatRate: "50" }] };
    const args = { organizationId: org.id, membership: owner.membership, actorMemberId: owner.membership.id, data };
    let offers;
    await t.test("parallel creates are unique on real independent database connections", async () => {
      offers = await Promise.all(Array.from({ length: 8 }, () => createOffer(args, prisma)));
      assert.equal(new Set(offers.map(({ offerNumber }) => offerNumber)).size, 8);
      assert.deepEqual(offers.map(({ offerNumber }) => offerNumber).sort(), Array.from({ length: 8 }, (_, i) => `AJ-2026-${String(i + 1).padStart(4, "0")}`));
    });
    await t.test("year and organization sequence scopes are independent", async () => {
      const nextYear = await createOffer({ ...args, data: { ...data, issueDate: new Date("2027-01-01T00:00:00Z"), validUntil: new Date("2027-02-01T00:00:00Z") } }, prisma);
      assert.equal(nextYear.offerNumber, "AJ-2027-0001");
      const other = await prisma.organization.create({ data: { name: "Other", slug: `${schema}_other` } });
      await prisma.organizationModule.create({ data: { organizationId: other.id, module: "PARTNERS", enabled: true } });
      const otherPartner = await prisma.partner.create({ data: { organizationId: other.id, name: "Other" } });
      const first = await createOffer({ ...args, organizationId: other.id, membership: { role: "OWNER" }, actorMemberId: null, data: { ...data, partnerId: otherPartner.id, projectId: null } }, prisma);
      assert.equal(first.offerNumber, "AJ-2026-0001");
    });
    await t.test("activity failure rolls back sequence, offer and items", async () => {
      const count = await prisma.offer.count();
      const itemCount = await prisma.offerItem.count();
      const failingClient = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
        return key === "activity" ? { create: async () => { throw new Error("Audit activity failure"); } } : target[key];
      } }))) };
      await assert.rejects(createOffer(args, failingClient), /Audit activity failure/);
      assert.equal(await prisma.offer.count(), count);
      assert.equal(await prisma.offerItem.count(), itemCount);
      const sequence = await prisma.offerSequence.findUnique({ where: { organizationId_year: { organizationId: org.id, year: 2026 } } });
      assert.equal(sequence.lastNumber, 8);
    });
    await t.test("item replacement, partial dates, status activity and cascade deletion", async () => {
      const offerId = offers[0].id;
      await assert.rejects(updateOffer({ ...args, offerId, data: { validUntil: new Date("2026-01-01T00:00:00Z") } }, prisma), /korábbi/);
      const updated = await updateOffer({ ...args, offerId, data: { status: "SENT", items: [{ ...data.items[0], name: "Replacement" }] } }, prisma);
      assert.equal(updated.status, "SENT");
      assert.equal(updated.project.id, project.id);
      assert.equal(updated.items.length, 1);
      assert.equal(updated.items[0].name, "Replacement");
      assert.equal(await prisma.activity.count({ where: { entityId: offerId, action: "STATUS_CHANGED" } }), 1);
      assert.equal(await deleteOffer({ organizationId: org.id, offerId }, prisma), true);
      assert.equal(await prisma.offerItem.count({ where: { offerId } }), 0);
      assert.equal(await prisma.activity.count({ where: { entityId: offerId, action: "DELETED" } }), 1);
      const next = await createOffer(args, prisma);
      assert.equal(next.offerNumber, "AJ-2026-0009");
    });
    await t.test("failed update restores existing items and status atomically", async () => {
      const offerId = offers[1].id;
      const before = await prisma.offer.findUnique({ where: { id: offerId }, include: { items: true } });
      const failingClient = { $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
        return key === "activity" ? { create: async () => { throw new Error("Audit update activity failure"); } } : target[key];
      } }))) };
      await assert.rejects(updateOffer({ ...args, offerId, data: { status: "SENT", items: [{ ...data.items[0], name: "Rolled back replacement" }] } }, failingClient), /Audit update activity failure/);
      const after = await prisma.offer.findUnique({ where: { id: offerId }, include: { items: true } });
      assert.deepEqual(after, before);
    });
    await t.test("real Offers routes enforce auth, modules, permissions, filters and tenant isolation", async () => {
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = randomUUID();
      const { default: offerRoutes } = await import("../src/routes/offerRoutes.js");
      const { default: activityRoutes } = await import("../src/routes/activityRoutes.js");
      const { generateAccessToken } = await import("../src/utils/token.js");
      const app = express();
      app.use(express.json());
      app.use("/api/offers", offerRoutes);
      app.use("/api/activities", activityRoutes);
      app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: "Audit technical error" }));
      const server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}`;
      const ownerToken = generateAccessToken(owner.user);
      const userToken = generateAccessToken(user.user);
      const request = async (path, { token = ownerToken, method = "GET", body } = {}) => {
        const response = await fetch(base + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { "Content-Type": "application/json" }) }, body: body && method !== "GET" ? JSON.stringify(body) : undefined });
        return { status: response.status, body: await response.json() };
      };
      const setUserPermissions = async (permissions) => {
        await prisma.organizationMemberPermission.deleteMany({ where: { organizationMemberId: user.membership.id } });
        if (permissions.length) await prisma.organizationMemberPermission.createMany({ data: permissions.map((permission) => ({ organizationMemberId: user.membership.id, permission })) });
      };
      try {
        const own = offers[1];
        const foreignOrg = await prisma.organization.create({ data: { name: "Foreign", slug: `${schema}_foreign` } });
        const foreignPartner = await prisma.partner.create({ data: { organizationId: foreignOrg.id, name: "Foreign partner" } });
        const foreignProject = await prisma.project.create({ data: { organizationId: foreignOrg.id, name: "Foreign project" } });
        const foreign = await prisma.offer.create({ data: { ...data, items: { create: data.items.map((item, index) => ({ ...item, position: index + 1 })) }, organizationId: foreignOrg.id, partnerId: foreignPartner.id, projectId: foreignProject.id, offerNumber: "AJ-2026-0001" } });
        const payload = { ...data, issueDate: "2026-09-12", validUntil: "2026-10-12" };
        for (const [module, relation] of [["PARTNERS", "partner"], ["PROJECTS", "project"]]) {
          await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: false } });
          assert.equal((await request(`/api/offers/${own.id}`)).body[relation], null);
          assert.equal((await request("/api/offers", { method: "POST", body: payload })).status, 403);
          await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module } }, data: { enabled: true } });
        }
        assert.equal((await request("/api/offers", { token: null })).status, 401);
        assert.equal((await request("/api/offers", { token: userToken })).status, 403);
        await setUserPermissions(["OFFERS_VIEW"]);
        assert.equal((await request("/api/offers", { token: userToken })).status, 200);
        for (const [method, path] of [["POST", "/api/offers"], ["PATCH", `/api/offers/${own.id}`], ["DELETE", `/api/offers/${own.id}`]]) {
          assert.equal((await request(path, { method, token: userToken, body: payload })).status, 403);
        }
        const hidden = await request(`/api/offers/${own.id}`, { token: userToken });
        assert.equal(hidden.body.partner, null);
        assert.equal(hidden.body.project, null);
        assert.equal(Object.hasOwn(hidden.body, "organizationId"), false);
        assert.equal(Object.hasOwn(hidden.body, "partnerId"), false);
        assert.equal(Object.hasOwn(hidden.body, "projectId"), false);
        assert.deepEqual(hidden.body.createdByMember, { user: { firstName: "Audit", lastName: "OWNER" } });
        assert.deepEqual((await request(`/api/offers?projectId=${project.id}`, { token: userToken })).body, []);
        await setUserPermissions(["OFFERS_VIEW", "OFFERS_EDIT"]);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", token: userToken, body: { note: "Hidden relations preserved" } })).status, 200);
        const preserved = await prisma.offer.findUnique({ where: { id: own.id } });
        assert.equal(preserved.partnerId, partner.id);
        assert.equal(preserved.projectId, project.id);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", token: userToken, body: { projectId: null } })).status, 403);
        await setUserPermissions(["OFFERS_VIEW", "OFFERS_CREATE"]);
        assert.equal((await request("/api/offers", { method: "POST", token: userToken, body: payload })).status, 403);
        await setUserPermissions(["OFFERS_VIEW", "OFFERS_CREATE", "PARTNERS_VIEW"]);
        assert.equal((await request("/api/offers", { method: "POST", token: userToken, body: { ...payload, projectId: null } })).status, 201);
        assert.equal((await request("/api/offers", { method: "POST", token: userToken, body: payload })).status, 403);
        await setUserPermissions(["OFFERS_VIEW", "OFFERS_DELETE"]);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", token: userToken, body: { note: "Denied" } })).status, 403);
        for (const method of ["GET", "PATCH", "DELETE"]) assert.equal((await request(`/api/offers/${foreign.id}`, { method, body: method === "PATCH" ? { note: "Foreign" } : undefined })).status, 404);
        for (const [field, id] of [["partnerId", foreignPartner.id], ["projectId", foreignProject.id]]) {
          assert.equal((await request("/api/offers", { method: "POST", body: { ...payload, [field]: id } })).status, 404);
          assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", body: { [field]: id } })).status, 404);
          assert.deepEqual((await request(`/api/offers?${field}=${id}`)).body, []);
        }
        for (const filter of ["status=", "status=UNKNOWN", "status=DRAFT&status=SENT", "partnerId=", "partnerId=true", "partnerId=1e0", "partnerId=1&partnerId=2", "projectId=-1", "projectId=invalid"]) {
          assert.equal((await request(`/api/offers?${filter}`)).status, 400, filter);
        }
        for (const status of ["", null, false, "UNKNOWN"]) assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", body: { status } })).status, 400);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", body: { status: "SENT" } })).status, 200);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", body: { note: "Omitted status" } })).body.status, "SENT");
        for (const body of [{ issueDate: "2027-01-01" }, { validUntil: "2026-01-01" }, { issueDate: "2026-02-29" }, { note: {} }, { items: [] }, { items: [{ ...payload.items[0], quantity: "Infinity" }] }]) {
          assert.equal((await request(`/api/offers/${own.id}`, { method: "PATCH", body })).status, 400);
        }
        const filtered = await request(`/api/offers?status=SENT&partnerId=${partner.id}&projectId=${project.id}&q=${own.offerNumber}&sortDirection=asc`);
        assert.deepEqual(filtered.body.map(({ id }) => id), [own.id]);
        await setUserPermissions(["ACTIVITY_VIEW"]);
        assert.deepEqual((await request("/api/activities?entityType=OFFER", { token: userToken })).body, []);
        await setUserPermissions(["ACTIVITY_VIEW", "OFFERS_VIEW"]);
        const activities = await request(`/api/activities?entityType=OFFER&entityId=${own.id}`, { token: userToken });
        assert.ok(activities.body.length);
        for (const activity of activities.body) {
          assert.equal(activity.organizationId, org.id);
          assert.equal(activity.metadata?.partnerId, undefined);
          assert.equal(activity.metadata?.projectId, undefined);
        }
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } }, data: { enabled: false } });
        for (const [method, path] of [["GET", "/api/offers"], ["GET", `/api/offers/${own.id}`], ["POST", "/api/offers"], ["PATCH", `/api/offers/${own.id}`], ["DELETE", `/api/offers/${own.id}`]]) assert.equal((await request(path, { method, body: payload })).status, 403);
        assert.deepEqual((await request("/api/activities?entityType=OFFER", { token: userToken })).body, []);
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } }, data: { enabled: true } });
        await setUserPermissions(["OFFERS_VIEW", "OFFERS_DELETE"]);
        assert.equal((await request(`/api/offers/${own.id}`, { method: "DELETE", token: userToken })).status, 200);
        assert.equal(await prisma.offerItem.count({ where: { offerId: own.id } }), 0);
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
      }
    });
    await t.test("existing organization and ADMIN/USER backfill follows Documents convention", async () => {
      await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } } });
      await prisma.organizationMemberPermission.deleteMany();
      const sql = await readFile("prisma/migrations/20260910150000_add_offers/migration.sql", "utf8");
      const connection = await pool.connect();
      try {
        await connection.query(`SET search_path TO "${schema}"`);
        await connection.query(sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"')));
      } finally { connection.release(); }
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } } })).enabled, true);
      for (const member of [admin, user]) {
        const permissions = await prisma.organizationMemberPermission.findMany({ where: { organizationMemberId: member.membership.id } });
        assert.deepEqual(permissions.map(({ permission }) => permission).sort(), ["OFFERS_CREATE", "OFFERS_DELETE", "OFFERS_EDIT", "OFFERS_VIEW"]);
      }
      assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: owner.membership.id } }), 0);
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } }, data: { enabled: false } });
      const connection2 = await pool.connect();
      try {
        await connection2.query(`SET search_path TO "${schema}"`);
        await connection2.query(sql.slice(sql.indexOf('INSERT INTO "OrganizationModule"')));
      } finally { connection2.release(); }
      assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "OFFERS" } } })).enabled, false);
    });
  } finally {
    if (prisma) await prisma.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
