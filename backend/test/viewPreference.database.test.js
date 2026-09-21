import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test, mock } from "node:test";
import express from "express";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { applyMigrations } from "./helpers/applyMigrations.js";

test("Configurable Views real database persistence, isolation, validation and bulk values", {
  skip: process.env.VIEW_PREFERENCES_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `view_audit_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let prisma;
  let server;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await applyMigrations(pool, schema);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }) });
    mock.module("../src/lib/prisma.js", { defaultExport: prisma });

    const { default: viewPreferenceRoutes } = await import("../src/routes/viewPreferenceRoutes.js");
    const { default: leadRoutes } = await import("../src/routes/leadRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");

    const org = await prisma.organization.create({ data: { name: "Views", slug: schema } });
    const otherOrg = await prisma.organization.create({ data: { name: "Other Views", slug: `${schema}_other` } });
    await initializeOrganizationModules(org.id, undefined, prisma);
    await initializeOrganizationModules(otherOrg.id, undefined, prisma);
    const makeMember = async (organizationId, label) => {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, passwordHash: "unused", firstName: label, lastName: "User" } });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId, role: "OWNER" } });
      return { user, membership, token: generateAccessToken(user) };
    };
    const memberA = await makeMember(org.id, "A");
    const memberB = await makeMember(org.id, "B");
    const foreign = await makeMember(otherOrg.id, "Foreign");

    const app = express();
    app.use(express.json());
    app.use("/api/view-preferences", viewPreferenceRoutes);
    app.use("/api/leads", leadRoutes);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message, ...(error.code && { code: error.code }) }));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token = memberA.token, method = "GET", body } = {}) => {
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    const leadField = await prisma.customField.create({ data: { organizationId: org.id, entityType: "LEAD", key: "annual_budget", label: "Éves keret", fieldType: "MONEY" } });
    const partnerField = await prisma.customField.create({ data: { organizationId: org.id, entityType: "PARTNER", key: "industry", label: "Iparág", fieldType: "SELECT", options: ["IT"] } });
    const foreignField = await prisma.customField.create({ data: { organizationId: otherOrg.id, entityType: "LEAD", key: "foreign", label: "Idegen", fieldType: "TEXT" } });
    const inactiveField = await prisma.customField.create({ data: { organizationId: org.id, entityType: "LEAD", key: "inactive", label: "Inaktív", fieldType: "TEXT", active: false } });

    await t.test("default, member scope, entity separation and persisted reload", async () => {
      const initial = await request("/api/view-preferences/LEAD");
      assert.equal(initial.status, 200);
      assert.equal(initial.body.customized, false);
      assert.deepEqual(initial.body.columns.map(({ key }) => key), ["name", "companyName", "status", "source", "email", "phone", "assignedMember", "createdAt"]);

      const saved = await request("/api/view-preferences/LEAD", { method: "PUT", body: { columns: [
        { type: "CORE", key: "name" },
        { type: "CUSTOM_FIELD", customFieldId: leadField.id },
        { type: "CORE", key: "phone" },
      ] } });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.customized, true);
      assert.deepEqual(saved.body.columns.map((column) => column.key || column.customFieldId), ["name", leadField.id, "phone"]);

      const reloaded = await request("/api/view-preferences/LEAD");
      assert.deepEqual(reloaded.body.columns, saved.body.columns);
      const otherMember = await request("/api/view-preferences/LEAD", { token: memberB.token });
      assert.equal(otherMember.body.customized, false);
      const partner = await request("/api/view-preferences/PARTNER");
      assert.equal(partner.body.customized, false);
    });

    await t.test("invalid, duplicate, missing-required, cross-tenant, wrong-entity and inactive columns return 400", async () => {
      const cases = [
        [{ type: "CORE", key: "name" }, { type: "CORE", key: "unknown" }],
        [{ type: "CORE", key: "name" }, { type: "CORE", key: "name" }],
        [{ type: "CORE", key: "email" }],
        [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: foreignField.id }],
        [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: partnerField.id }],
        [{ type: "CORE", key: "name" }, { type: "CUSTOM_FIELD", customFieldId: inactiveField.id }],
      ];
      for (const columns of cases) assert.equal((await request("/api/view-preferences/LEAD", { method: "PUT", body: { columns } })).status, 400);
    });

    await t.test("Lead list returns selected custom values in bulk and preserves tenant isolation", async () => {
      const leadOne = await prisma.lead.create({ data: { organizationId: org.id, name: "Első" } });
      const leadTwo = await prisma.lead.create({ data: { organizationId: org.id, name: "Második" } });
      await prisma.customFieldValue.createMany({ data: [
        { organizationId: org.id, customFieldId: leadField.id, entityType: "LEAD", entityId: leadOne.id, value: "12000000" },
        { organizationId: org.id, customFieldId: leadField.id, entityType: "LEAD", entityId: leadTwo.id, value: "5000000" },
      ] });
      const listed = await request("/api/leads");
      assert.equal(listed.status, 200);
      assert.equal(listed.body.find(({ id }) => id === leadOne.id).customFieldValues[leadField.id], "12000000");
      assert.equal(listed.body.find(({ id }) => id === leadTwo.id).customFieldValues[leadField.id], "5000000");
      const foreignList = await request("/api/leads", { token: foreign.token });
      assert.equal(foreignList.status, 200);
      assert.equal(foreignList.body.length, 0);
    });

    await t.test("deactivated saved fields are omitted gracefully and reset deletes the override", async () => {
      await prisma.customField.update({ where: { id: leadField.id }, data: { active: false } });
      const afterDeactivate = await request("/api/view-preferences/LEAD");
      assert.deepEqual(afterDeactivate.body.columns.map(({ key }) => key), ["name", "phone"]);
      assert.equal((await prisma.entityListPreference.findFirst({ where: { organizationMemberId: memberA.membership.id, entityType: "LEAD" } })).columns.length, 3);

      const reset = await request("/api/view-preferences/LEAD", { method: "DELETE" });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.customized, false);
      assert.equal(await prisma.entityListPreference.count({ where: { organizationMemberId: memberA.membership.id, entityType: "LEAD" } }), 0);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (prisma) await prisma.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
