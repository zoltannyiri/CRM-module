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

test("Follow-up migrations upgrade existing pre-FollowUp data and preserve custom settings", {
  skip: process.env.FOLLOW_UPS_DB_TESTS !== "1", timeout: 120000,
}, async () => {
  const schema = `follow_up_upgrade_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^follow_up_upgrade_[a-f0-9]{32}$/);
  const directory = await mkdtemp(path.join(tmpdir(), "crm_follow_up_migration_"));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace("-pooler.", ".");
  const connectionString = url.toString();
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const cutoff = "20260914085900_add_follow_up_enums", source = path.resolve("prisma/migrations");
    const migrations = path.join(directory, "migrations"), config = path.join(directory, "prisma.config.mjs");
    for (const name of (await readdir(source)).sort()) if (name < cutoff || name === "migration_lock.toml") await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    await writeFile(config, `export default { schema: ${JSON.stringify(path.resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    url.searchParams.set("schema", schema);
    const deploy = () => promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", config], {
      env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" }, timeout: 60000,
    });
    assert.match((await deploy()).stdout, /All migrations have been successfully applied/);
    const org = await prisma.organization.create({ data: { name: "Existing", slug: schema } });
    const other = await prisma.organization.create({ data: { name: "No module yet", slug: schema + "_other" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOLLOW_UPS", enabled: false } });
    const members = [];
    for (const role of ["OWNER", "ADMIN", "USER"]) {
      const user = await prisma.user.create({ data: { email: randomUUID() + "@example.invalid", passwordHash: "unused", firstName: "Audit", lastName: role } });
      members.push(await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role } }));
    }
    await prisma.organizationMemberPermission.create({ data: { organizationMemberId: members[2].id, permission: "LEADS_VIEW" } });
    const [lead] = await prisma.$queryRawUnsafe(`INSERT INTO "${schema}"."Lead" ("organizationId", "name", "status", "source", "createdAt", "updatedAt") VALUES ($1, $2, 'QUALIFIED', 'OTHER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING "id", "name", "status"`, org.id, "Existing Lead");
    const pipeline = await prisma.pipeline.create({ data: { organizationId: org.id, name: "Custom existing Pipeline", isDefault: true, stages: { create: [{ name: "Custom stage", position: 1 }] } }, include: { stages: true } });
    await prisma.leadPipelinePosition.create({ data: { organizationId: org.id, leadId: lead.id, pipelineId: pipeline.id, pipelineStageId: pipeline.stages[0].id } });
    const position = await prisma.leadPipelinePosition.findUnique({ where: { leadId: lead.id } });
    for (const name of (await readdir(source)).filter((name) => name >= cutoff && name !== "migration_lock.toml")) await cp(path.join(source, name), path.join(migrations, name), { recursive: true });
    assert.match((await deploy()).stdout, /20260914090000_add_follow_ups/);
    assert.match((await deploy()).stdout, /No pending migrations/);
    const upgradedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    for (const key of ["id", "name", "status"]) assert.equal(upgradedLead[key], lead[key]);
    assert.equal(upgradedLead.convertedAt, null); assert.equal(upgradedLead.convertedPartnerId, null); assert.equal(upgradedLead.convertedByMemberId, null);
    assert.deepEqual(await prisma.pipeline.findUnique({ where: { id: pipeline.id }, include: { stages: true } }), pipeline);
    assert.deepEqual(await prisma.leadPipelinePosition.findUnique({ where: { leadId: lead.id } }), position);
    assert.equal(await prisma.followUp.count(), 0);
    assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "FOLLOW_UPS" } } })).enabled, false);
    assert.equal((await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: other.id, module: "FOLLOW_UPS" } } })).enabled, true);
    assert.equal(await prisma.organizationMemberPermission.count({ where: { organizationMemberId: members[0].id } }), 0);
    for (const member of members.slice(1)) {
      const permissions = (await prisma.organizationMemberPermission.findMany({ where: { organizationMemberId: member.id } })).map(({ permission }) => permission);
      assert.equal(permissions.filter((key) => key.startsWith("FOLLOW_UPS_")).length, 5);
      if (member.role === "USER") assert.ok(permissions.includes("LEADS_VIEW"));
      assert.equal(permissions.includes("LEADS_EDIT"), false);
    }
  } finally {
    await prisma.$disconnect(); await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
