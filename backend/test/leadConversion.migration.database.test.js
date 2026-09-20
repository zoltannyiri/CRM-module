import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("Lead conversion migrations upgrade existing data and backfill only the new permission", {
  skip: process.env.LEAD_CONVERSION_DB_TESTS !== "1", timeout: 120000,
}, async () => {
  const schema = `lead_conversion_upgrade_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(path.join(tmpdir(), "crm_lead_conversion_migration_"));
  const source = path.resolve("prisma/migrations");
  const migrations = path.join(directory, "migrations");
  const config = path.join(directory, "prisma.config.mjs");
  const cutoff = "20260920090000_add_lead_conversion_enums";
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace("-pooler.", ".");
  const connectionString = url.toString();
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const name of (await readdir(source)).sort()) if (name < cutoff || name === "migration_lock.toml") await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    await writeFile(config, `export default { schema: ${JSON.stringify(path.resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    url.searchParams.set("schema", schema);
    const deploy = () => promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", config], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, timeout: 60000,
    });
    assert.match((await deploy()).stdout, /All migrations have been successfully applied/);
    const org = await prisma.organization.create({ data: { name: "Existing", slug: schema } });
    await prisma.organizationModule.createMany({ data: [{ organizationId: org.id, module: "LEADS", enabled: true }, { organizationId: org.id, module: "PARTNERS", enabled: false }] });
    const members = [];
    for (const role of ["OWNER", "ADMIN", "USER"]) {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      members.push(await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role } }));
    }
    const lead = await prisma.$queryRawUnsafe(`INSERT INTO "${schema}"."Lead" ("organizationId", "name", "status", "source", "createdAt", "updatedAt") VALUES ($1, $2, 'QUALIFIED', 'REFERRAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING "id", "name", "status", "source"`, org.id, "Existing Lead");
    const partner = await prisma.partner.create({ data: { organizationId: org.id, name: "Existing Partner" } });
    for (const name of (await readdir(source)).filter((name) => name >= cutoff && name !== "migration_lock.toml")) await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    assert.match((await deploy()).stdout, /20260920090100_add_lead_conversion/);
    assert.match((await deploy()).stdout, /No pending migrations/);
    const upgraded = await prisma.lead.findUnique({ where: { id: lead[0].id } });
    assert.equal(upgraded.name, lead[0].name); assert.equal(upgraded.status, lead[0].status); assert.equal(upgraded.source, lead[0].source);
    assert.equal(upgraded.convertedAt, null); assert.equal(upgraded.convertedPartnerId, null); assert.equal(upgraded.convertedByMemberId, null);
    assert.equal((await prisma.partner.findUnique({ where: { id: partner.id } })).name, partner.name);
    assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "PARTNERS" } } })).enabled, false);
    assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: members[0].id, permission: "LEADS_CONVERT" } }), 0);
    for (const member of members.slice(1)) assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: member.id, permission: "LEADS_CONVERT" } }), 1);
  } finally {
    await prisma.$disconnect(); await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
