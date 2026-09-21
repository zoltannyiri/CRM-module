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

test("Filtering Foundation real database typed EAV, isolation, validation and route integration", {
  skip: process.env.FILTERING_DB_TESTS !== "1",
  timeout: 120000,
}, async (t) => {
  const schema = `filter_audit_${randomUUID().replaceAll("-", "")}`;
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

    const { default: leadRoutes } = await import("../src/routes/leadRoutes.js");
    const { default: partnerRoutes } = await import("../src/routes/partnerRoutes.js");
    const { generateAccessToken } = await import("../src/utils/token.js");
    const { initializeOrganizationModules } = await import("../src/services/organizationModuleService.js");

    const org = await prisma.organization.create({ data: { name: "Filter Org", slug: schema } });
    const otherOrg = await prisma.organization.create({ data: { name: "Other Org", slug: `${schema}_other` } });
    await initializeOrganizationModules(org.id, undefined, prisma);
    await initializeOrganizationModules(otherOrg.id, undefined, prisma);

    const makeMember = async (organizationId, label, role = "OWNER", permissions = []) => {
      const user = await prisma.user.create({
        data: { email: `${randomUUID()}@example.invalid`, passwordHash: "unused", firstName: label, lastName: "User" },
      });
      const membership = await prisma.organizationMember.create({ data: { userId: user.id, organizationId, role } });
      if (permissions.length) {
        await prisma.organizationMemberPermission.createMany({
          data: permissions.map((permission) => ({ organizationMemberId: membership.id, permission })),
        });
      }
      return { user, membership, token: generateAccessToken(user) };
    };

    const memberA = await makeMember(org.id, "A");
    const foreignMember = await makeMember(otherOrg.id, "Foreign");

    const app = express();
    app.use(express.json());
    app.use("/api/leads", leadRoutes);
    app.use("/api/partners", partnerRoutes);
    app.use((error, _req, res, _next) =>
      res.status(error.statusCode || 500).json({ message: error.message, ...(error.code && { code: error.code }) })
    );
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;

    const request = async (path, { token = memberA.token, method = "GET", body } = {}) => {
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      return { status: response.status, data };
    };

    await t.test("NUMBER/MONEY typed filtering proves numeric comparison (> 20 matches 100, 1000 not 5, 20)", async () => {
      const budgetField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "budget", label: "Éves keret", fieldType: "MONEY", active: true },
      });

      const lead5 = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead 5" } });
      const lead20 = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead 20" } });
      const lead100 = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead 100" } });
      const lead1000 = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead 1000" } });

      await prisma.customFieldValue.createMany({
        data: [
          { organizationId: org.id, entityType: "LEAD", customFieldId: budgetField.id, entityId: lead5.id, value: "5" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: budgetField.id, entityId: lead20.id, value: "20" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: budgetField.id, entityId: lead100.id, value: "100" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: budgetField.id, entityId: lead1000.id, value: "1000" },
        ],
      });

      const filter = [
        { field: { type: "CUSTOM_FIELD", customFieldId: budgetField.id }, operator: "GREATER_THAN", value: 20 },
      ];
      const res = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filter))}`);
      assert.equal(res.status, 200);
      const names = res.data.map((l) => l.name);
      assert.ok(!names.includes("Lead 5"));
      assert.ok(!names.includes("Lead 20"));
      assert.ok(names.includes("Lead 100"));
      assert.ok(names.includes("Lead 1000"));
    });

    await t.test("Legacy invalid non-numeric value does not cause 500 crash and is safely excluded", async () => {
      const budgetField = await prisma.customField.findFirst({ where: { organizationId: org.id, key: "budget" } });
      const invalidLead = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Invalid Data" } });

      // Raw insert of corrupted string
      await prisma.customFieldValue.create({
        data: {
          organizationId: org.id,
          entityType: "LEAD",
          customFieldId: budgetField.id,
          entityId: invalidLead.id,
          value: "not-a-number",
        },
      });

      const filter = [
        { field: { type: "CUSTOM_FIELD", customFieldId: budgetField.id }, operator: "GREATER_THAN", value: 10 },
      ];
      const res = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filter))}`);
      assert.equal(res.status, 200);
      const names = res.data.map((l) => l.name);
      assert.ok(!names.includes("Lead Invalid Data"));
      assert.ok(names.includes("Lead 100"));
    });

    await t.test("DATE custom field filtering matches chronologically (AFTER 2026-06-01)", async () => {
      const dateField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "deadline", label: "Határidő", fieldType: "DATE", active: true },
      });

      const leadJan = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Jan" } });
      const leadJun = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Jun" } });
      const leadDec = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Dec" } });

      await prisma.customFieldValue.createMany({
        data: [
          { organizationId: org.id, entityType: "LEAD", customFieldId: dateField.id, entityId: leadJan.id, value: "2026-01-10" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: dateField.id, entityId: leadJun.id, value: "2026-06-20" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: dateField.id, entityId: leadDec.id, value: "2026-12-01" },
        ],
      });

      const filter = [
        { field: { type: "CUSTOM_FIELD", customFieldId: dateField.id }, operator: "AFTER", value: "2026-06-01" },
      ];
      const res = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filter))}`);
      assert.equal(res.status, 200);
      const names = res.data.map((l) => l.name);
      assert.ok(!names.includes("Lead Jan"));
      assert.ok(names.includes("Lead Jun"));
      assert.ok(names.includes("Lead Dec"));
    });

    await t.test("SELECT, MULTI_SELECT, and BOOLEAN custom field filtering", async () => {
      const categoryField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "cat", label: "Kategória", fieldType: "SELECT", options: ["A", "B", "C"], active: true },
      });
      const tagsField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "tags", label: "Címkék", fieldType: "MULTI_SELECT", options: ["IT", "Sales", "HR"], active: true },
      });
      const vipField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "vip", label: "VIP", fieldType: "BOOLEAN", active: true },
      });

      const leadA = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead VIP A" } });
      const leadB = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Standard B" } });

      await prisma.customFieldValue.createMany({
        data: [
          { organizationId: org.id, entityType: "LEAD", customFieldId: categoryField.id, entityId: leadA.id, value: "A" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: tagsField.id, entityId: leadA.id, value: JSON.stringify(["IT", "Sales"]) },
          { organizationId: org.id, entityType: "LEAD", customFieldId: vipField.id, entityId: leadA.id, value: "true" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: categoryField.id, entityId: leadB.id, value: "B" },
          { organizationId: org.id, entityType: "LEAD", customFieldId: tagsField.id, entityId: leadB.id, value: JSON.stringify(["HR"]) },
          { organizationId: org.id, entityType: "LEAD", customFieldId: vipField.id, entityId: leadB.id, value: "false" },
        ],
      });

      // Filter VIP = true AND tags CONTAINS_ANY ["IT"]
      const filter = [
        { field: { type: "CUSTOM_FIELD", customFieldId: vipField.id }, operator: "EQUALS", value: true },
        { field: { type: "CUSTOM_FIELD", customFieldId: tagsField.id }, operator: "CONTAINS_ANY", value: ["IT"] },
      ];
      const res = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filter))}`);
      assert.equal(res.status, 200);
      const names = res.data.map((l) => l.name);
      assert.ok(names.includes("Lead VIP A"));
      assert.ok(!names.includes("Lead Standard B"));
    });

    await t.test("Tenant isolation: foreign organization records never match", async () => {
      const foreignLead = await prisma.lead.create({ data: { organizationId: otherOrg.id, name: "Foreign Lead" } });
      const foreignField = await prisma.customField.create({
        data: { organizationId: otherOrg.id, entityType: "LEAD", key: "budget", label: "Foreign Keret", fieldType: "MONEY", active: true },
      });
      await prisma.customFieldValue.create({
        data: { organizationId: otherOrg.id, entityType: "LEAD", customFieldId: foreignField.id, entityId: foreignLead.id, value: "50000000" },
      });

      // Org A user queries with Org A filter
      const res = await request("/api/leads");
      assert.equal(res.status, 200);
      const names = res.data.map((l) => l.name);
      assert.ok(!names.includes("Foreign Lead"));

      // Org A user attempting to filter using Org B customFieldId receives 400
      const crossFilter = [
        { field: { type: "CUSTOM_FIELD", customFieldId: foreignField.id }, operator: "GREATER_THAN", value: 1000 },
      ];
      const crossRes = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(crossFilter))}`);
      assert.equal(crossRes.status, 400);
      assert.match(crossRes.data.message, /Ismeretlen vagy nem elérhető egyéni mező/);
    });

    await t.test("PARTNER list filtering with CORE fields and Custom Fields", async () => {
      const partnerField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "PARTNER", key: "industry", label: "Iparág", fieldType: "SELECT", options: ["IT", "Építőipar", "Pénzügy"], active: true },
      });

      const partner1 = await prisma.partner.create({
        data: { organizationId: org.id, name: "Acme Tech Kft", type: "COMPANY", email: "info@acme.invalid" },
      });
      const partner2 = await prisma.partner.create({
        data: { organizationId: org.id, name: "Kovács János", type: "PERSON", email: "janos@example.invalid" },
      });

      await prisma.customFieldValue.create({
        data: { organizationId: org.id, entityType: "PARTNER", customFieldId: partnerField.id, entityId: partner1.id, value: "IT" },
      });
      await prisma.customFieldValue.create({
        data: { organizationId: org.id, entityType: "PARTNER", customFieldId: partnerField.id, entityId: partner2.id, value: "Építőipar" },
      });

      // Filter: CORE type = COMPANY AND Custom field industry = IT
      const filter = [
        { field: { type: "CORE", key: "type" }, operator: "EQUALS", value: "COMPANY" },
        { field: { type: "CUSTOM_FIELD", customFieldId: partnerField.id }, operator: "EQUALS", value: "IT" },
      ];
      const res = await request(`/api/partners?filters=${encodeURIComponent(JSON.stringify(filter))}`);
      assert.equal(res.status, 200);
      const names = res.data.map((p) => p.name);
      assert.ok(names.includes("Acme Tech Kft"));
      assert.ok(!names.includes("Kovács János"));
    });

    await t.test("IS_EMPTY and IS_NOT_EMPTY semantics on custom fields", async () => {
      const noteField = await prisma.customField.create({
        data: { organizationId: org.id, entityType: "LEAD", key: "secret_note", label: "Megjegyzés", fieldType: "TEXT", active: true },
      });

      const emptyLead = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead Without Note" } });
      const filledLead = await prisma.lead.create({ data: { organizationId: org.id, name: "Lead With Note" } });

      await prisma.customFieldValue.create({
        data: { organizationId: org.id, entityType: "LEAD", customFieldId: noteField.id, entityId: filledLead.id, value: "Bizalmas info" },
      });

      // Filter IS_EMPTY
      const filterEmpty = [
        { field: { type: "CUSTOM_FIELD", customFieldId: noteField.id }, operator: "IS_EMPTY" },
      ];
      const resEmpty = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filterEmpty))}`);
      assert.equal(resEmpty.status, 200);
      const emptyNames = resEmpty.data.map((l) => l.name);
      assert.ok(emptyNames.includes("Lead Without Note"));
      assert.ok(!emptyNames.includes("Lead With Note"));

      // Filter IS_NOT_EMPTY
      const filterNotEmpty = [
        { field: { type: "CUSTOM_FIELD", customFieldId: noteField.id }, operator: "IS_NOT_EMPTY" },
      ];
      const resNotEmpty = await request(`/api/leads?filters=${encodeURIComponent(JSON.stringify(filterNotEmpty))}`);
      assert.equal(resNotEmpty.status, 200);
      const notEmptyNames = resNotEmpty.data.map((l) => l.name);
      assert.ok(!notEmptyNames.includes("Lead Without Note"));
      assert.ok(notEmptyNames.includes("Lead With Note"));
    });
  } finally {
    server?.close();
    await prisma?.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
