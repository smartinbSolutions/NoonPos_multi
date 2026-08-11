// packages/db-setup/index.js
import path from "node:path";
import { initDataDirectory } from "./steps/initDataDirectory.js";
import { registerService } from "./steps/registerService.js";
import { configureNetworking } from "./steps/configureNetworking.js";
import { configureFirewall } from "./steps/configureFirewall.js";
import { createDatabase } from "./steps/createDatabase.js";
import { setupSchema } from "./steps/setupSchema.js";
import { getHostStatus } from "./steps/checkStatus.js";
import { loadAdminConfig } from "./configStore.js";

const DEFAULT_PORT = 5432;

/**
 * Runs the full host setup sequence, in dependency order:
 *   1. initDataDirectory  — copy bundled Postgres binaries, run initdb
 *   2. registerService    — register + start Postgres as a background service
 *   3. configureNetworking — make Postgres itself accept remote connections
 *   4. configureFirewall  — open the port so other terminals can reach it
 *   5. createDatabase     — create the app database + scoped app_user
 *   6. setupSchema        — create/update all tables
 *
 * Safe to call multiple times — every step is independently idempotent,
 * so re-running this after a previous partial or full run only does the
 * work that's still missing.
 *
 * appResourcesPath: where the app's own bundled files live (contains the
 * bundled Postgres binaries under bin/win, bin/mac-arm64, bin/mac-x64).
 * In a packaged Electron app this is process.resourcesPath.
 *
 * Returns the connection info the app itself needs to connect as
 * app_user for its day-to-day operation.
 */
export async function setupDatabaseHost(
  appResourcesPath,
  { port = DEFAULT_PORT } = {}
) {
  console.log("[db-setup] Starting host setup...");

  const { paths } = await initDataDirectory(appResourcesPath);
  await registerService(paths.dataDir);
  await configureNetworking(paths.dataDir);
  await configureFirewall(port);
  const appCredentials = await createDatabase(paths);

  // schema/ ships as a sibling folder alongside bin/ inside
  // appResourcesPath — same resolution base used for the Postgres
  // binaries, whether running in dev (db-setup's own package folder)
  // or packaged (the folder next to the .exe).
  const schemaDir = path.join(appResourcesPath, "schema");
  await setupSchema(paths, schemaDir);

  console.log("[db-setup] Host setup complete.");
  return appCredentials;
}

/**
 * Returns this platform's paths (dataDir, binDir, configDir, etc.)
 * without running any setup. Needed by callers that want to check
 * status (getHostStatus) or connection info (getAppConnectionInfo)
 * without triggering initDataDirectory's side effects.
 */
export async function getPlatformPaths() {
  const platform =
    process.platform === "win32"
      ? await import("./platform/windows.js")
      : process.platform === "darwin"
        ? await import("./platform/mac.js")
        : null;

  if (!platform) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  return platform.getPaths();
}

/**
 * Returns the app_user connection details for this host, without running
 * any setup. Useful when the app just needs to know how to connect (e.g.
 * the local app instance running on the same machine as the host), and
 * setup has already happened via setupDatabaseHost() or the standalone
 * db-setup-cli tool.
 */
export function getAppConnectionInfo(paths) {
  const adminConfig = loadAdminConfig(paths);
  if (!adminConfig || !adminConfig.appUser) {
    return null;
  }
  return {
    host: adminConfig.host,
    port: adminConfig.port,
    database: adminConfig.appDatabase,
    user: adminConfig.appUser,
    password: adminConfig.appUserPassword,
  };
}

// Re-exported for callers (like db-setup-cli) that want to run or
// inspect individual steps rather than the full sequence.
export {
  initDataDirectory,
  registerService,
  configureNetworking,
  configureFirewall,
  createDatabase,
  setupSchema,
  getHostStatus,
};
