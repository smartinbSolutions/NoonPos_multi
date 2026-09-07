// packages/app/src/main/db/pgBinPaths.js
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { loadAdminConfig } from "@noonpos/db-setup/configStore.js";
import { getPaths as getWindowsPaths } from "@noonpos/db-setup/platform/windows.js";
import { getPaths as getMacPaths } from "@noonpos/db-setup/platform/mac.js";

function getPlatformPaths() {
  if (process.platform === "win32") return getWindowsPaths();
  if (process.platform === "darwin") return getMacPaths();
  return null;
}

/**
 * Every terminal's own bundled copy of pg_dump/pg_restore — ships inside
 * the regular app install via forge.config.js's packagerConfig.extraResource
 * (../db-setup/bin), so backup/restore work from any terminal, not just
 * the host. This is intentionally separate from getPlatformPaths() above,
 * which resolves to the HOST-ONLY install location used by
 * isLocalPostgresInstalled()/getLocalAppUserCredentials() below.
 */
function getBundledBinDir() {
  if (app.isPackaged) {
    // forge's extraResource copies ../db-setup/bin into resources/bin
    if (process.platform === "win32") {
      return path.join(process.resourcesPath, "bin", "win");
    }
    if (process.platform === "darwin") {
      const arch = process.arch === "arm64" ? "mac-arm64" : "mac-x64";
      return path.join(process.resourcesPath, "bin", arch);
    }
  } else {
    // Dev mode — read straight from the workspace package, no bundling
    // step involved yet.
    const devBinRoot = path.join(app.getAppPath(), "..", "db-setup", "bin");
    if (process.platform === "win32") {
      return path.join(devBinRoot, "win");
    }
    if (process.platform === "darwin") {
      const arch = process.arch === "arm64" ? "mac-arm64" : "mac-x64";
      return path.join(devBinRoot, arch);
    }
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

export function getPgDumpPath() {
  const binName = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  return path.join(getBundledBinDir(), "bin", binName);
}

export function getPgRestorePath() {
  const binName =
    process.platform === "win32" ? "pg_restore.exe" : "pg_restore";
  return path.join(getBundledBinDir(), "bin", binName);
}

/**
 * True only on the machine that actually ran NoonPos-DBSetup.exe — the
 * data directory only exists there. Used to auto-detect "this machine is
 * the database host" without asking the operator to manually fill out
 * DbSetupPage describing their own machine to itself.
 */
export function isLocalPostgresInstalled() {
  const paths = getPlatformPaths();
  if (!paths) return false;
  return fs.existsSync(paths.dataDir);
}

/**
 * Reads the app_user credentials NoonPos-DBSetup.exe already generated
 * and saved to pg-admin.json during createDatabase.js's run. Lets the
 * app auto-configure its own connection on the host machine (loopback)
 * without the operator ever typing these values in manually.
 */
export function getLocalAppUserCredentials() {
  const paths = getPlatformPaths();
  if (!paths) return null;

  const adminConfig = loadAdminConfig(paths);
  if (!adminConfig?.appUser || !adminConfig?.appUserPassword) return null;

  return {
    host: "127.0.0.1",
    port: adminConfig.port || 5432,
    database: adminConfig.appDatabase || "noonpos",
    user: adminConfig.appUser,
    password: adminConfig.appUserPassword,
  };
}
