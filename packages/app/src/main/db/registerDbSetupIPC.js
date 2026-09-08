// packages/app/src/main/db/registerDbSetupIPC.js
import { ipcMain } from "electron";
import {
  hasDbConfig,
  isDbHostMachine,
  loadDbConfig,
  saveDbConfig,
} from "./dbConnectionConfig.js";
import { testDbConnection } from "./testDbConnection.js";
import { resetPool } from "../../backend/dbConnect.js";

export default function registerDbSetupIPC() {
  ipcMain.handle("db:hasConfig", async () => hasDbConfig());

  ipcMain.handle("db:testConnection", async (_event, config) => {
    return testDbConnection(config);
  });

  ipcMain.handle("db:saveConfig", async (_event, config) => {
    // Re-verify before saving — never trust that a prior test-connection
    // call from the renderer reflects the current state; the config
    // could have been edited after testing, or the host could have
    // gone offline in between.
    const result = await testDbConnection(config);
    if (!result.success) {
      return result;
    }

    saveDbConfig(config);
    await resetPool();
    return { success: true };
  });

  ipcMain.handle("db:getConfig", async () => {
    // Only used internally by the app itself (e.g. to know how to
    // connect on startup) — never exposed for the renderer to display
    // the password back to the user.
    return loadDbConfig();
  });

  ipcMain.handle("db:isHost", async () => {
    return { isHost: isDbHostMachine() };
  });

  // Verifies the ALREADY-SAVED config still actually works — distinct
  // from db:hasConfig (which only checks a file exists) and
  // db:testConnection (which tests a NEW, not-yet-saved config from the
  // form). Used on app launch to detect "the host's IP changed" or
  // "the host is offline" and route back to DbSetupPage automatically,
  // rather than leaving the user stuck with no way to fix it themselves.
  ipcMain.handle("db:checkSavedConnection", async () => {
    const config = loadDbConfig();
    if (!config) {
      return { success: false, error: "DB_NOT_CONFIGURED" };
    }
    return testDbConnection(config);
  });
}
