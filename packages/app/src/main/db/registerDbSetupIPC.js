// packages/app/src/main/db/registerDbSetupIPC.js
import { ipcMain } from "electron";
import {
  hasDbConfig,
  loadDbConfig,
  saveDbConfig,
} from "./dbConnectionConfig.js";
import { testDbConnection } from "./testDbConnection.js";

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
    return { success: true };
  });

  ipcMain.handle("db:getConfig", async () => {
    // Only used internally by the app itself (e.g. to know how to
    // connect on startup) — never exposed for the renderer to display
    // the password back to the user.
    return loadDbConfig();
  });
}
