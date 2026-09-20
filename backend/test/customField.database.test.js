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

test("Custom Fields real database tenant, permissions, validation and values", {
  skip: process.env.CUSTOM_FIELDS_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `cf_audit_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let prisma;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("schema", schema);
    const { stdout } = await promisify(execFile)(process.execPath, [
      "node_modules/prisma/build/index.js", "migrate", "deploy"
    ], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
      timeout: 60000,
    });
    assert.match(stdout, /All migrations have been successfully applied/);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }) });
    mock.module("../src/lib/prisma.js", { defaultExport: prisma });

    const { default: customFieldRoutes } = await import("../src/routes/customFieldRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");

    const org = await prisma.organization.create({ data: { name: "CF Audit", slug: schema } });
    const other = await prisma.organization.create({ data: { name: "Foreign", slug: schema + "_other" } });

    const makeMember = async (role, organizationId = org.id) => {
      const user = await prisma.user.create({
        data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "CF", lastName: role }
      });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId, role } });
      return { user, membership };
    };

    const owner = await makeMember("OWNER");
    const user = await makeMember("USER");
    const foreignOwner = await makeMember("OWNER", other.id);

    const app = express();
    app.use(express.json());
    app.use("/api/custom-fields", customFieldRoutes);
    app.use((error, _req, res, _next) => {
      const status = error.statusCode || 500;
      return res.status(status).json({ message: status >= 500 ? "Technical error" : error.message });
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const ownerToken = generateAccessToken(owner.user);
    const userToken = generateAccessToken(user.user);
    const foreignToken = generateAccessToken(foreignOwner.user);

    const req = async (path, { token = ownerToken, method = "GET", body } = {}) => {
      const resp = await fetch(base + path, {
        method,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(body !== undefined && { "Content-Type": "application/json" })
        },
        body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined
      });
      return { status: resp.status, body: await resp.json() };
    };

    const setPermissions = async (perms) => {
      await prisma.organizationMemberPermission.deleteMany({ where: { organizationMemberId: user.membership.id } });
      if (perms.length) {
        await prisma.organizationMemberPermission.createMany({
          data: perms.map((permission) => ({ organizationMemberId: user.membership.id, permission }))
        });
      }
    };

    let fieldId;

    try {
      await t.test("1. list requires CUSTOM_FIELDS_VIEW", async () => {
        await setPermissions([]);
        const { status } = await req("/api/custom-fields", { token: userToken });
        assert.equal(status, 403);
      });

      await t.test("2. user with CUSTOM_FIELDS_VIEW can list fields", async () => {
        await setPermissions(["CUSTOM_FIELDS_VIEW"]);
        const { status, body } = await req("/api/custom-fields", { token: userToken });
        assert.equal(status, 200);
        assert.ok(Array.isArray(body));
        assert.equal(body.length, 0);
      });

      await t.test("3. create requires CUSTOM_FIELDS_CREATE", async () => {
        await setPermissions(["CUSTOM_FIELDS_VIEW"]);
        const { status } = await req("/api/custom-fields", {
          token: userToken, method: "POST",
          body: { entityType: "LEAD", key: "priority", label: "Prioritas", fieldType: "TEXT" }
        });
        assert.equal(status, 403);
      });

      await t.test("4. user with CUSTOM_FIELDS_CREATE can create a field", async () => {
        await setPermissions(["CUSTOM_FIELDS_CREATE"]);
        const { status, body } = await req("/api/custom-fields", {
          token: userToken,
          method: "POST",
          body: { entityType: "LEAD", key: "priority", label: "Prioritas", fieldType: "TEXT" }
        });
        assert.equal(status, 201);
        assert.equal(body.key, "priority");
        assert.equal(body.entityType, "LEAD");
        assert.equal(body.fieldType, "TEXT");
        assert.equal(body.active, true);
        assert.equal(body.required, false);
        fieldId = body.id;
      });

      await t.test("5. duplicate key in same org+entityType returns 409", async () => {
        const { status } = await req("/api/custom-fields", {
          method: "POST",
          body: { entityType: "LEAD", key: "priority", label: "Prioritas 2", fieldType: "TEXT" }
        });
        assert.equal(status, 409);
      });

      await t.test("6. duplicate key with different entityType is allowed", async () => {
        const { status } = await req("/api/custom-fields", {
          method: "POST",
          body: { entityType: "PARTNER", key: "priority", label: "Partner prioritas", fieldType: "SELECT", options: ["Low", "High"] }
        });
        assert.equal(status, 201);
      });

      await t.test("7. duplicate key in different organization is allowed", async () => {
        const { status } = await req("/api/custom-fields", {
          token: foreignToken,
          method: "POST",
          body: { entityType: "LEAD", key: "priority", label: "Foreign prioritas", fieldType: "TEXT" }
        });
        assert.equal(status, 201);
      });

      await t.test("8. invalid key format returns 400", async () => {
        const { status } = await req("/api/custom-fields", {
          method: "POST",
          body: { entityType: "LEAD", key: "Bad Key!", label: "Bad", fieldType: "TEXT" }
        });
        assert.equal(status, 400);
      });

      await t.test("9. update requires CUSTOM_FIELDS_EDIT", async () => {
        await setPermissions(["CUSTOM_FIELDS_VIEW"]);
        const { status } = await req(`/api/custom-fields/${fieldId}`, {
          token: userToken, method: "PATCH", body: { label: "Uj label" }
        });
        assert.equal(status, 403);
      });

      await t.test("10. user with CUSTOM_FIELDS_EDIT can update label and sortOrder", async () => {
        await setPermissions(["CUSTOM_FIELDS_EDIT"]);
        const { status, body } = await req(`/api/custom-fields/${fieldId}`, {
          token: userToken, method: "PATCH", body: { label: "Frissitett Prioritas", sortOrder: 10 }
        });
        assert.equal(status, 200);
        assert.equal(body.label, "Frissitett Prioritas");
        assert.equal(body.sortOrder, 10);
        assert.equal(body.key, "priority");
      });

      await t.test("11. cross-tenant update returns 404 (tenant isolation)", async () => {
        const { status } = await req(`/api/custom-fields/${fieldId}`, {
          token: foreignToken, method: "PATCH", body: { label: "Hacked" }
        });
        assert.equal(status, 404);
      });

      await t.test("12. deactivate requires CUSTOM_FIELDS_DELETE", async () => {
        await setPermissions(["CUSTOM_FIELDS_VIEW"]);
        const { status } = await req(`/api/custom-fields/${fieldId}`, {
          token: userToken, method: "DELETE"
        });
        assert.equal(status, 403);
      });

      await t.test("13. user with CUSTOM_FIELDS_DELETE can deactivate a field", async () => {
        await setPermissions(["CUSTOM_FIELDS_DELETE"]);
        const { status, body } = await req(`/api/custom-fields/${fieldId}`, {
          token: userToken, method: "DELETE"
        });
        assert.equal(status, 200);
        assert.match(body.message, /deaktiv/i);
        const inDb = await prisma.customField.findFirst({ where: { id: fieldId } });
        assert.equal(inDb.active, false);
      });

      await t.test("14. cross-tenant deactivate returns 404", async () => {
        const { status } = await req(`/api/custom-fields/${fieldId}`, {
          token: foreignToken, method: "DELETE"
        });
        assert.equal(status, 404);
      });

      await t.test("15. set values: required field empty returns 400", async () => {
        const reqField = await prisma.customField.create({
          data: {
            organizationId: org.id, entityType: "LEAD", key: "budget",
            label: "Koltsegvetes", fieldType: "NUMBER", required: true
          }
        });
        const { status } = await req("/api/custom-fields/values", {
          method: "PUT",
          body: { entityType: "LEAD", entityId: 1, values: [{ customFieldId: reqField.id, value: "" }] }
        });
        assert.equal(status, 400);
      });

      await t.test("16. set values: NUMBER type rejects non-numeric", async () => {
        const numField = await prisma.customField.create({
          data: { organizationId: org.id, entityType: "LEAD", key: "amount", label: "Osszeg", fieldType: "NUMBER" }
        });
        const { status } = await req("/api/custom-fields/values", {
          method: "PUT",
          body: { entityType: "LEAD", entityId: 1, values: [{ customFieldId: numField.id, value: "abc" }] }
        });
        assert.equal(status, 400);
      });

      await t.test("17. set values: SELECT type rejects values not in options", async () => {
        const selField = await prisma.customField.create({
          data: {
            organizationId: org.id, entityType: "LEAD", key: "tier",
            label: "Szint", fieldType: "SELECT", options: ["Bronze", "Silver", "Gold"]
          }
        });
        const { status } = await req("/api/custom-fields/values", {
          method: "PUT",
          body: { entityType: "LEAD", entityId: 1, values: [{ customFieldId: selField.id, value: "Platinum" }] }
        });
        assert.equal(status, 400);
      });

      await t.test("18. set and get values persisted correctly for LEAD and PARTNER", async () => {
        const lead = await prisma.lead.create({
          data: { organizationId: org.id, name: "Test Lead" }
        });
        const textField = await prisma.customField.create({
          data: { organizationId: org.id, entityType: "LEAD", key: "extra_note", label: "Extra megjegyzes", fieldType: "TEXT" }
        });
        const setResp = await req("/api/custom-fields/values", {
          method: "PUT",
          body: { entityType: "LEAD", entityId: lead.id, values: [{ customFieldId: textField.id, value: "Teszt ertek" }] }
        });
        assert.equal(setResp.status, 200);

        const getResp = await req(`/api/custom-fields/values?entityType=LEAD&entityId=${lead.id}`);
        assert.equal(getResp.status, 200);
        assert.equal(getResp.body.values[textField.id], "Teszt ertek");
        assert.ok(getResp.body.fields.some(f => f.id === textField.id));
      });

      await t.test("19. foreign org cannot read values via tenant isolation", async () => {
        const lead = await prisma.lead.create({
          data: { organizationId: org.id, name: "Private Lead" }
        });
        const privateField = await prisma.customField.create({
          data: { organizationId: org.id, entityType: "LEAD", key: "private_note", label: "Private", fieldType: "TEXT" }
        });
        await req("/api/custom-fields/values", {
          method: "PUT",
          body: { entityType: "LEAD", entityId: lead.id, values: [{ customFieldId: privateField.id, value: "Secret data" }] }
        });
        const { status, body } = await req(`/api/custom-fields/values?entityType=LEAD&entityId=${lead.id}`, { token: foreignToken });
        assert.equal(status, 200);
        // Tenant isolation: foreign org does not see org's private field or its value
        assert.equal(body.values[privateField.id], undefined);
        assert.ok(!body.fields.some(f => f.id === privateField.id));
      });
    } finally {
      await server.close();
    }
  } finally {
    await prisma?.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
