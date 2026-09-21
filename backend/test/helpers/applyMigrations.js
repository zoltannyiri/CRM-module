import { readdir, readFile } from "node:fs/promises";

export async function applyMigrations(pool, schema) {
  const migrationRoot = new URL("../../prisma/migrations/", import.meta.url);
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const migrations = entries.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name));
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of migrations) {
      const sql = await readFile(new URL(`${migration.name}/migration.sql`, migrationRoot), "utf8");
      const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) {
        try {
          await client.query(statement);
        } catch (error) {
          error.message = `${migration.name}: ${error.message}`;
          throw error;
        }
      }
    }
  } finally {
    client.release();
  }
}
