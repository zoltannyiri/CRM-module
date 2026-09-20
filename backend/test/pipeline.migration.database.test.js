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

test("Pipeline migration deploy upgrades pre-Pipeline data without resetting customization", {
  skip: process.env.PIPELINE_DB_TESTS !== "1", timeout: 120000,
}, async () => {
  const schema = `pipeline_upgrade_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^pipeline_upgrade_[a-f0-9]{32}$/);
  const directory = await mkdtemp(path.join(tmpdir(), "crm_pipeline_migration_"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  const connectionUrl = new URL(process.env.DATABASE_URL);
  if (connectionUrl.hostname.endsWith(".neon.tech")) connectionUrl.hostname = connectionUrl.hostname.replace("-pooler.", ".");
  const connectionString = connectionUrl.toString();
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const migrationName = "20260913120000_add_pipeline";
    const source = path.resolve("prisma/migrations");
    const migrations = path.join(directory, "migrations");
    for (const name of (await readdir(source)).sort()) {
      if (name < migrationName || name === "migration_lock.toml") await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    }
    const config = path.join(directory, "prisma.config.mjs");
    await writeFile(config, `export default { schema: ${JSON.stringify(path.resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const url = new URL(connectionString); url.searchParams.set("schema", schema);
    const deploy = () => promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", config], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, timeout: 60000,
    });
    assert.match((await deploy()).stdout, /All migrations have been successfully applied/);
    const org = await prisma.organization.create({ data: { name: "Existing organization", slug: schema } });
    await prisma.organizationModule.createMany({ data: [
      { organizationId: org.id, module: "PIPELINE", enabled: false },
      { organizationId: org.id, module: "LEADS", enabled: true },
    ] });
    const members = [];
    for (const role of ["OWNER", "ADMIN", "USER"]) {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      members.push(await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role } }));
    }
    await prisma.organizationMemberPermission.create({ data: { organizationMemberId: members[2].id, permission: "LEADS_VIEW" } });
    const [lead] = await prisma.$queryRawUnsafe(`INSERT INTO "${schema}"."Lead" ("organizationId", "name", "status", "source", "email", "createdAt", "updatedAt") VALUES ($1, $2, 'QUALIFIED', 'OTHER', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING "id", "name", "status", "email"`, org.id, "Existing Lead", "preserve@example.invalid");
    for (const name of (await readdir(source)).filter((name) => name >= migrationName && name !== "migration_lock.toml")) await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    assert.match((await deploy()).stdout, /20260913120000_add_pipeline/);
    assert.match((await deploy()).stdout, /No pending migrations/);
    const pipelines = await prisma.pipeline.findMany({ where: { organizationId: org.id }, include: { stages: { orderBy: { position: "asc" } } } });
    assert.equal(pipelines.length, 1); assert.equal(pipelines[0].isDefault, true);
    assert.deepEqual(pipelines[0].stages.map(({ position }) => position), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "PIPELINE" } } })).enabled, false);
    assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: members[0].id } }), 0);
    for (const member of members.slice(1)) {
      const permissions = (await prisma.organizationMemberPermission.findMany({ where: { organizationMemberId: member.id } })).map(({ permission }) => permission);
      assert.deepEqual(permissions.filter((key) => key.startsWith("PIPELINE_")).sort(), ["PIPELINE_CREATE", "PIPELINE_DELETE", "PIPELINE_EDIT", "PIPELINE_VIEW"]);
      if (member.role === "USER") assert.equal(permissions.includes("LEADS_VIEW"), true);
      assert.equal(permissions.includes("LEADS_EDIT"), false);
    }
    const upgradedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    for (const key of ["id", "name", "status", "email"]) assert.equal(upgradedLead[key], lead[key]);
    assert.equal(upgradedLead.convertedAt, null); assert.equal(upgradedLead.convertedPartnerId, null); assert.equal(upgradedLead.convertedByMemberId, null);
    assert.equal(await prisma.leadPipelinePosition.count(), 0);
  } finally {
    await prisma.$disconnect();
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
