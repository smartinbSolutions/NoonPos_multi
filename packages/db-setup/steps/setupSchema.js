// packages/db-setup/steps/setupSchema.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { loadAdminConfig } from "../configStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, "..", "schema");

/**
 * Idempotently applies any schema/*.sql files not yet recorded in
 * schema_migrations. Connects as the superuser (this is setup/repair
 * work, consistent with our rule that the superuser is only ever used
 * by db-setup itself, never by the day-to-day app).
 *
 * Safe to call multiple times — already-applied files are skipped.
 */
export async function setupSchema(paths) {
  const adminConfig = loadAdminConfig(paths);
  if (!adminConfig) {
    throw new Error(
      "[db-setup] No admin config found — initDataDirectory() must run first."
    );
  }
  if (!adminConfig.appUser) {
    throw new Error(
      "[db-setup] No app_user recorded in admin config — createDatabase() must run first."
    );
  }

  const client = new Client({
    host: adminConfig.host,
    port: adminConfig.port,
    user: adminConfig.superuser,
    password: adminConfig.superuserPassword,
    database: adminConfig.appDatabase,
  });

  await client.connect();

  try {
    const alreadyApplied = await getAlreadyAppliedFilenames(client);
    const allFiles = fs
      .readdirSync(SCHEMA_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort(); // filenames are numerically prefixed (001_, 002_...), sort = correct order

    const pending = allFiles.filter((name) => !alreadyApplied.has(name));

    if (pending.length === 0) {
      console.log("[db-setup] Schema is already up to date, nothing to apply.");
    }

    for (const filename of pending) {
      await applyMigrationFile(client, filename);
    }

    // Table/sequence ownership defaults to the superuser (since it ran
    // CREATE DATABASE / CREATE TABLE), so app_user needs explicit grants
    // to read/write anything, even though it already has DB-level
    // privileges from createDatabase.js. Re-run this every time (cheap,
    // idempotent) so any newly added tables from this run are covered too.
    await grantAppUserPrivileges(client, adminConfig.appUser);

    console.log("[db-setup] Migrations complete.");
    return { applied: pending };
  } finally {
    await client.end();
  }
}

async function getAlreadyAppliedFilenames(client) {
  try {
    const result = await client.query("SELECT filename FROM schema_migrations");
    return new Set(result.rows.map((row) => row.filename));
  } catch (err) {
    // schema_migrations doesn't exist yet — this is expected on a brand
    // new database, before 001_core.sql (which creates that table) has
    // ever run. Treat as "nothing applied yet" rather than an error.
    if (err.code === "42P01" /* undefined_table */) {
      return new Set();
    }
    throw err;
  }
}

async function applyMigrationFile(client, filename) {
  console.log(`[db-setup] Applying ${filename}...`);
  const sql = fs.readFileSync(path.join(SCHEMA_DIR, filename), "utf-8");

  await client.query("BEGIN");
  try {
    // Multiple statements in one string — pg's simple query protocol
    // (used automatically when no parameters are passed) runs them all
    // as a batch, which is what we want for a schema file full of
    // CREATE TABLE statements.
    await client.query(sql);

    // Record this file as applied, in the SAME transaction as the
    // schema changes themselves — if the file fails partway through,
    // the whole transaction rolls back and nothing is recorded, so a
    // re-run will correctly retry this file from scratch.
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw new Error(`[db-setup] Failed applying ${filename}: ${err.message}`);
  }
}

async function grantAppUserPrivileges(client, appUser) {
  // Quoting appUser would be safer if it were user input, but it's a
  // fixed constant from createDatabase.js (APP_USER_NAME), never
  // user-supplied, so plain interpolation is fine here — same reasoning
  // we used for database/role names elsewhere.
  await client.query(`GRANT USAGE ON SCHEMA public TO ${appUser}`);
  await client.query(
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${appUser}`
  );
  await client.query(
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${appUser}`
  );
  // Cover tables created by FUTURE migrations too, without needing to
  // re-grant manually after every schema change.
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${appUser}`
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${appUser}`
  );
}
