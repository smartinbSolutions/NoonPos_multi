// packages/db-setup/steps/initDataDirectory.js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateSuperuserPassword } from "../credentials.js";
import { saveAdminConfig, adminConfigExists } from "../configStore.js";

async function loadPlatformModule() {
  if (process.platform === "win32") {
    return import("../platform/windows.js");
  }
  if (process.platform === "darwin") {
    return import("../platform/mac.js");
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Idempotently ensures the Postgres data directory exists and is
 * initialized. Safe to call multiple times — if setup already ran
 * (detected via the admin config file), this is a no-op.
 *
 * Returns the admin config (existing or newly created).
 */
export async function initDataDirectory(appResourcesPath) {
  const platform = await loadPlatformModule();
  const paths = platform.getPaths();

  // --- Idempotency check -------------------------------------------------
  // If the admin config already exists, we've already run initdb on this
  // machine before. Don't touch the data directory again — just return
  // what we already know.
  if (adminConfigExists(paths)) {
    console.log("[db-setup] Data directory already initialized, skipping.");
    return { alreadyInitialized: true, paths };
  }

  // Extra safety: even if the config file is missing (e.g. deleted by
  // accident), don't blindly re-run initdb against a non-empty directory —
  // initdb itself will refuse and error out, which is the correct behavior
  // here rather than us trying to silently "fix" it.
  const dataDirExists =
    fs.existsSync(paths.dataDir) && fs.readdirSync(paths.dataDir).length > 0;

  if (dataDirExists) {
    throw new Error(
      `[db-setup] Data directory "${paths.dataDir}" already has content, ` +
        `but no admin config was found. Refusing to run initdb to avoid ` +
        `overwriting an existing database. Manual inspection required.`
    );
  }

  // --- Actually do the work -----------------------------------------------
  fs.mkdirSync(paths.dataDir, { recursive: true });

  // Copy the bundled Postgres binaries from inside the app to their
  // install destination on this machine, if not already done.
  platform.ensureBinariesInstalled(appResourcesPath);

  const superuserPassword = generateSuperuserPassword();

  // Write the password to a temp file for --pwfile, then delete it
  // immediately after initdb reads it — never pass the password as a
  // plain command-line argument (would be visible in process lists).
  const pwfilePath = path.join(os.tmpdir(), `noonpos-pwfile-${Date.now()}.txt`);
  fs.writeFileSync(pwfilePath, superuserPassword, { mode: 0o600 });

  try {
    const { exe, args } = platform.getInitdbCommand(paths.dataDir, pwfilePath);
    console.log(`[db-setup] Running initdb...`);
    execFileSync(exe, args, { stdio: "inherit" });
  } finally {
    // Always clean up the temp password file, even if initdb failed.
    fs.rmSync(pwfilePath, { force: true });
  }

  // --- Persist admin config for future steps/repairs ----------------------
  const adminConfig = {
    createdAt: new Date().toISOString(),
    platform: process.platform,
    dataDir: paths.dataDir,
    binDir: paths.binDir,
    host: "127.0.0.1",
    port: 5432,
    superuser: "postgres",
    superuserPassword,
  };

  saveAdminConfig(paths, adminConfig);

  // Lock down the config directory so only admins/root can read it.
  if (platform.getLockdownConfigCommand) {
    const lockCmd = platform.getLockdownConfigCommand(paths.configDir);
    execFileSync(lockCmd.exe, lockCmd.args, { stdio: "inherit" });
  }
  if (platform.getLockdownConfigOwnerCommand) {
    const ownerCmd = platform.getLockdownConfigOwnerCommand(paths.configDir);
    execFileSync(ownerCmd.exe, ownerCmd.args, { stdio: "inherit" });
  }

  console.log("[db-setup] Data directory initialized successfully.");
  return { alreadyInitialized: false, paths, adminConfig };
}
