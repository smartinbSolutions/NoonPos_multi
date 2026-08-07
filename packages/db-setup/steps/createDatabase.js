// packages/db-setup/steps/createDatabase.js
import crypto from "node:crypto";
import { Client } from "pg";

import { loadAdminConfig, saveAdminConfig } from "../configStore.js";

const APP_DATABASE_NAME = "noonpos";
const APP_USER_NAME = "noonpos_app";

/**
 * Idempotently ensures the app's database and scoped app_user role exist.
 * Connects as the postgres superuser (using the password/paths saved by
 * initDataDirectory) to do so — this is the ONLY step that ever uses the
 * superuser credentials for anything beyond initial setup/repair.
 *
 * Safe to call multiple times.
 */
export async function createDatabase(paths) {
  const adminConfig = loadAdminConfig(paths);
  if (!adminConfig) {
    throw new Error(
      "[db-setup] No admin config found — initDataDirectory() must run first."
    );
  }

  // Connect as superuser to the default "postgres" maintenance database —
  // you can't run CREATE DATABASE while connected to the database you're
  // about to create/check, so we always connect here first.
  const client = new Client({
    host: adminConfig.host,
    port: adminConfig.port,
    user: adminConfig.superuser,
    password: adminConfig.superuserPassword,
    database: "postgres",
  });

  await client.connect();

  try {
    const dbExists = await databaseExists(client, APP_DATABASE_NAME);
    if (dbExists) {
      console.log(
        `[db-setup] Database "${APP_DATABASE_NAME}" already exists, skipping.`
      );
    } else {
      console.log(`[db-setup] Creating database "${APP_DATABASE_NAME}"...`);
      // Database/role names come from our own constants above, never from
      // user input, so string interpolation here is safe — Postgres doesn't
      // support parameterized identifiers in DDL statements anyway.
      await client.query(`CREATE DATABASE ${APP_DATABASE_NAME}`);
    }

    const roleAlreadyExists = await roleExists(client, APP_USER_NAME);
    let appUserPassword = adminConfig.appUserPassword;

    if (roleAlreadyExists) {
      console.log(
        `[db-setup] Role "${APP_USER_NAME}" already exists, skipping.`
      );
      if (!appUserPassword) {
        // Shouldn't normally happen, but guard against a config file that
        // predates this field being added, or was edited by hand.
        throw new Error(
          `[db-setup] Role "${APP_USER_NAME}" exists but no password is ` +
            `recorded in the admin config. Manual repair required.`
        );
      }
    } else {
      console.log(`[db-setup] Creating role "${APP_USER_NAME}"...`);
      appUserPassword = crypto.randomBytes(24).toString("base64url");
      // Postgres's CREATE ROLE ... PASSWORD clause does not accept a
      // parameterized placeholder ($1) — it requires a literal string,
      // which is a limitation of that specific SQL grammar, not a
      // general restriction on parameterized queries. Embedding it
      // directly is safe here specifically because base64url-encoded
      // output can only ever contain [A-Za-z0-9_-], never a quote or
      // backslash character — unlike genuinely user-supplied input.
      await client.query(
        `CREATE ROLE ${APP_USER_NAME} WITH LOGIN PASSWORD '${appUserPassword}'`
      );
    }

    // Grant the app user everything it needs on its own database, and
    // nothing else — no superuser rights, no access to other databases.
    await client.query(
      `GRANT ALL PRIVILEGES ON DATABASE ${APP_DATABASE_NAME} TO ${APP_USER_NAME}`
    );

    // Persist the app_user credentials into the admin config so future
    // runs (and runMigrations.js) can reuse them without regenerating.
    if (!roleAlreadyExists) {
      saveAdminConfig(paths, {
        ...adminConfig,
        appDatabase: APP_DATABASE_NAME,
        appUser: APP_USER_NAME,
        appUserPassword,
      });
    }

    console.log("[db-setup] Database and app user are ready.");
    return {
      database: APP_DATABASE_NAME,
      user: APP_USER_NAME,
      password: appUserPassword,
      host: adminConfig.host,
      port: adminConfig.port,
    };
  } finally {
    await client.end();
  }
}

async function databaseExists(client, name) {
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name]
  );
  return result.rowCount > 0;
}

async function roleExists(client, name) {
  const result = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [name]
  );
  return result.rowCount > 0;
}
