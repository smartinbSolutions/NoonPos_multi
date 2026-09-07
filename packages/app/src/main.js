import { app, BrowserWindow, ipcMain, net, protocol, session } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { pathToFileURL } from "node:url";
import registerAllIPC from "./backend/registerAllIPC";
import activateLicense from "./main/license/activateLicense";
import verifyLicenseFile from "./main/license/verifyLicenseFile";
import { hasDbConfig, saveDbConfig } from "./main/db/dbConnectionConfig";
import { testDbConnection } from "./main/db/testDbConnection";
import {
  isLocalPostgresInstalled,
  getLocalAppUserCredentials,
} from "./main/db/pgBinPaths";
import registerDbSetupIPC from "./main/db/registerDbSetupIPC";
import { query } from "./backend/dbConnect";
import { registerThisTerminal } from "./backend/services/terminals.service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.commandLine.appendSwitch("enable-experimental-web-platform-features");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

if (started) app.quit();

let mainWindow;

/* ============================================================
   PROTOCOL / WINDOW HELPERS
   ============================================================ */

function registerAppFileProtocol() {
  protocol.handle("app-file", async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.slice(1));

    if (!filePath) {
      return new Response("Missing file path", { status: 400 });
    }

    const uploadsDir = path.join(app.getPath("userData"), "uploads");
    const resolvedFilePath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(uploadsDir);
    const relativePath = path.relative(resolvedUploadsDir, resolvedFilePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(resolvedFilePath).toString());
  });
}

export function loadRendererRoute(window, routePath) {
  const devServerUrl =
    !app.isPackaged && typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== "undefined"
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : null;

  if (devServerUrl) {
    const url = new URL(devServerUrl);
    url.hash = routePath;
    window.loadURL(url.toString());
    return;
  }

  const rendererName =
    typeof MAIN_WINDOW_VITE_NAME !== "undefined"
      ? MAIN_WINDOW_VITE_NAME
      : "main_window";

  window.loadFile(
    path.join(__dirname, `../renderer/${rendererName}/index.html`),
    { hash: routePath },
  );
}

function createWindow(routePath = "/") {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableBlinkFeatures: "Serial",
      experimentalFeatures: true,
    },
  });

  loadRendererRoute(mainWindow, routePath);

  if (!app.isPackaged && process.env.DISABLE_DEVTOOLS !== "true") {
    mainWindow.webContents.openDevTools();
  }
}

/* ============================================================
   LICENSE
   ============================================================ */

function registerLicenseIPC() {
  ipcMain.handle("license:status", async () => verifyLicenseFile());

  ipcMain.handle("license:activate", async (_event, licenseKey) => {
    const result = await activateLicense(licenseKey);

    if (result.success && mainWindow) {
      loadRendererRoute(mainWindow, resolveInitialRoute({ valid: true }));
    }

    return result;
  });
}

function resolveInitialRoute(licenseStatus) {
  if (!licenseStatus.valid) return "/activation";
  // App.js's own dbStatus check (hasConfig + checkSavedConnection) is what
  // actually gates the DB-setup screen at runtime — this just picks the
  // initial hash before that check runs. Kept simple on purpose.
  return "/";
}

/* ============================================================
   DATABASE AUTO-PROVISIONING (host machine only)
   ============================================================ */

/**
 * If this machine is running Postgres locally (NoonPos-DBSetup.exe was
 * run here) and no connection config has been saved yet, auto-provision
 * one using loopback + the app_user credentials db-setup already
 * generated — so the operator on the host machine never has to manually
 * fill out DbSetupPage describing their own machine to itself.
 *
 * Guest terminals are unaffected: isLocalPostgresInstalled() is only
 * ever true on the actual host, since only NoonPos-DBSetup.exe creates
 * that local data directory. If this fails for any reason (Postgres
 * still starting up, etc.), nothing is saved and the app falls through
 * to App.js's normal dbStatus gate, which shows DbSetupPage exactly as
 * it does today — no new failure mode, just a fast path when healthy.
 */
async function autoProvisionLocalDbConfig() {
  if (hasDbConfig()) return;
  if (!isLocalPostgresInstalled()) return;

  const config = getLocalAppUserCredentials();
  if (!config) return;

  const result = await testDbConnection(config);
  if (result.success) {
    saveDbConfig(config);
    console.log("[main] Auto-provisioned local database connection.");
  } else {
    console.error(
      "[main] Local Postgres auto-provisioning failed:",
      result.error,
    );
  }
}

/* ============================================================
   APP STARTUP
   ============================================================ */

app.whenReady().then(async () => {
  // 1. Protocol + license IPC + db-setup IPC — must exist before anything
  //    else touches them.
  registerAppFileProtocol();
  registerLicenseIPC();
  registerDbSetupIPC();

  // 2. Auto-provision the DB connection on the host machine, if
  //    applicable, before anything tries to query the database.
  await autoProvisionLocalDbConfig();

  // 3. Register the rest of the app's IPC handlers, and kick off
  //    terminal registration in the background (non-blocking — a slow
  //    or unreachable DB should never delay window creation).
  try {
    registerAllIPC();
    registerThisTerminal(query).catch((err) => {
      console.error("Failed to register this terminal:", err);
    });
  } catch (error) {
    console.error("Failed to register application IPC handlers", error);
  }

  // 4. Serial port permissions (barcode scale support).
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "serial";
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    return details.deviceType === "serial";
  });

  session.defaultSession.on(
    "select-serial-port",
    (event, portList, _webContents, callback) => {
      event.preventDefault();

      if (!portList.length) {
        console.warn("No serial ports were found for the scale.");
        callback("");
        return;
      }
      callback(portList[0].portId);
    },
  );

  // 5. Open the window. App.js's own license/dbStatus/isSetup checks take
  //    over from here to decide what's actually shown.
  const licenseStatus = await verifyLicenseFile();
  createWindow(resolveInitialRoute(licenseStatus));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      verifyLicenseFile().then((status) => {
        createWindow(resolveInitialRoute(status));
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
