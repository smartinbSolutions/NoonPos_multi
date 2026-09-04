import { app, BrowserWindow, ipcMain, net, protocol, session } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

import { fileURLToPath } from "url";
import { dirname } from "path";
import { pathToFileURL } from "node:url";
import registerAllIPC from "./backend/registerAllIPC";
import activateLicense from "./main/license/activateLicense";
import verifyLicenseFile from "./main/license/verifyLicenseFile";
import { hasDbConfig } from "./main/db/dbConnectionConfig";
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

// Just add "export" here, keep only this one:
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
  if (!hasDbConfig()) return "/db-setup";
  return "/";
}
app.whenReady().then(async () => {
  registerAppFileProtocol();
  registerLicenseIPC();
  registerDbSetupIPC();

  try {
    registerAllIPC();
    await registerThisTerminal(query);
  } catch (error) {
    console.error("Failed to register application IPC handlers", error);
  }
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
