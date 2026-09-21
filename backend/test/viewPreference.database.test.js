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
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace("-pooler.", ".");
  const connectionString = url.toString();
  const pool = new Pool({ connectionString });
  let prisma;
  let server;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await applyMigrations(pool, schema);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
    mock.module("../src/lib/prisma.js", { defaultExport: prisma });

    const { default: viewPreferenceRoutes } = await import("../src/routes/viewPreferenceRoutes.js");
    const { default: leadRoutes } = await import("../src/routes/leadRoutes.js");
    const { default: partnerRoutes } = await import("../src/routes/partnerRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");

    const org = await prisma.organization.create({ data: { name: "Views", slug: schema } });
    const otherOrg = await prisma.organization.create({ data: { name: "Other Views", slug: `${schema}_other` } });
    await initializeOrganizationModules(org.id, undefined, prisma);
    await initializeOrganizationModules(otherOrg.id, undefined, prisma);
    const makeMember = async (organizationId, label, role = "OWNER", permissions = []) => {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.invalid`, passwordHash: "unused", firstName: label, lastName: "User" } });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId, role } });
      if (permissions.length) {
        await prisma.organizationMemberPermission.createMany({
          data: permissions.map((permission) => ({ organizationMemberId: membership.id, permission })),
        });
      }
      return { user, membership, token: generateAccessToken(user) };
    };
    const memberA = await makeMember(org.id, "A");
    const memberB = await makeMember(org.id, "B");
    const foreign = await makeMember(otherOrg.id, "Foreign");
    const noViewMember = await makeMember(org.id, "NoView", "USER", []);
    const leadsViewMember = await makeMember(org.id, "LeadsView", "USER", ["LEADS_VIEW"]);
    const partnersViewMember = await makeMember(org.id, "PartnersView", "USER", ["PARTNERS_VIEW"]);

    const app = express();
    app.use(express.json());
    app.use("/api/view-preferences", viewPreferenceRoutes);
    app.use("/api/leads", leadRoutes);
    app.use("/api/partners", partnerRoutes);
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

    await t.test("permission 403 enforcement on view preferences when missing view permissions", async () => {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const leadRes = await request("/api/view-preferences/LEAD", {
          token: noViewMember.token,
          method,
          ...(method === "PUT" && { body: { columns: [{ type: "CORE", key: "name" }] } }),
        });
        assert.equal(leadRes.status, 403);
        assert.equal(leadRes.body.code, "PERMISSION_DENIED");

        const partnerRes = await request("/api/view-preferences/PARTNER", {
          token: noViewMember.token,
          method,
          ...(method === "PUT" && { body: { columns: [{ type: "CORE", key: "name" }] } }),
        });
        assert.equal(partnerRes.status, 403);
        assert.equal(partnerRes.body.code, "PERMISSION_DENIED");
      }

      // Member with only LEADS_VIEW
      const leadAllowed = await request("/api/view-preferences/LEAD", { token: leadsViewMember.token });
      assert.equal(leadAllowed.status, 200);
      const partnerDenied = await request("/api/view-preferences/PARTNER", { token: leadsViewMember.token });
      assert.equal(partnerDenied.status, 403);
      assert.equal(partnerDenied.body.code, "PERMISSION_DENIED");

      // Member with only PARTNERS_VIEW
      const partnerAllowed = await request("/api/view-preferences/PARTNER", { token: partnersViewMember.token });
      assert.equal(partnerAllowed.status, 200);
      const leadDenied = await request("/api/view-preferences/LEAD", { token: partnersViewMember.token });
      assert.equal(leadDenied.status, 403);
      assert.equal(leadDenied.body.code, "PERMISSION_DENIED");
    });

    await t.test("Partner list returns selected custom values in bulk and preserves tenant isolation", async () => {
      const partnerOne = await prisma.partner.create({ data: { organizationId: org.id, name: "Partner Alpha", type: "COMPANY" } });
      const partnerTwo = await prisma.partner.create({ data: { organizationId: org.id, name: "Partner Beta", type: "PERSON" } });
      const foreignPartner = await prisma.partner.create({ data: { organizationId: otherOrg.id, name: "Foreign Partner", type: "COMPANY" } });

      await prisma.customFieldValue.createMany({ data: [
        { organizationId: org.id, customFieldId: partnerField.id, entityType: "PARTNER", entityId: partnerOne.id, value: "IT" },
        { organizationId: org.id, customFieldId: partnerField.id, entityType: "PARTNER", entityId: partnerTwo.id, value: "Finance" },
        { organizationId: otherOrg.id, customFieldId: foreignField.id, entityType: "PARTNER", entityId: foreignPartner.id, value: "Secret" },
      ] });

      const setPref = await request("/api/view-preferences/PARTNER", {
        method: "PUT",
        body: {
          columns: [
            { type: "CORE", key: "name" },
            { type: "CUSTOM_FIELD", customFieldId: partnerField.id },
            { type: "CORE", key: "type" },
          ],
        },
      });
      assert.equal(setPref.status, 200);

      const listed = await request("/api/partners");
      assert.equal(listed.status, 200);
      const one = listed.body.find(({ id }) => id === partnerOne.id);
      const two = listed.body.find(({ id }) => id === partnerTwo.id);
      assert.ok(one, "Partner Alpha must be returned");
      assert.ok(two, "Partner Beta must be returned");
      assert.equal(one.customFieldValues[partnerField.id], "IT");
      assert.equal(two.customFieldValues[partnerField.id], "Finance");
      assert.equal(listed.body.some(({ id }) => id === foreignPartner.id), false, "Foreign partner must not be returned");

      const foreignList = await request("/api/partners", { token: foreign.token });
      assert.equal(foreignList.status, 200);
      assert.equal(foreignList.body.some(({ id }) => id === partnerOne.id || id === partnerTwo.id), false);
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
