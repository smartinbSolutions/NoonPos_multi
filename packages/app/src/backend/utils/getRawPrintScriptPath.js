const path = require("path");
const { app } = require("electron");

/**
 * Resolves the absolute path to send-raw-print.ps1 in both environments:
 * - Packaged app: Forge's `extraResource` copies it next to the asar,
 *   accessible via process.resourcesPath.
 * - Dev mode: read directly from the repo's resources/ folder.
 *
 * Adjust the dev-mode relative path if this file doesn't end up at
 * src/backend/utils/getRawPrintScriptPath.js — it's computed from __dirname
 * up to the repo root, then into resources/.
 */
export function getRawPrintScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "send-raw-print.ps1");
  }
  // __dirname here = src/backend/utils -> up 3 levels = repo root
  return path.join(
    __dirname,
    "..",
    "..",
    "..",
    "resources",
    "send-raw-print.ps1",
  );
}
