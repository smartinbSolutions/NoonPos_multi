// packages/app/src/main/db/pgBinPaths.js
import path from "node:path";
import { getPaths as getWindowsPaths } from "@noonpos/db-setup/platform/windows.js";
import { getPaths as getMacPaths } from "@noonpos/db-setup/platform/mac.js";

function getBinDir() {
  if (process.platform === "win32") {
    return getWindowsPaths().binDir;
  }
  if (process.platform === "darwin") {
    return getMacPaths().binDir;
  }
  throw new Error(
    `Unsupported platform for pg_dump/pg_restore: ${process.platform}`,
  );
}

export function getPgDumpPath() {
  const binName = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  return path.join(getBinDir(), binName);
}

export function getPgRestorePath() {
  const binName =
    process.platform === "win32" ? "pg_restore.exe" : "pg_restore";
  return path.join(getBinDir(), binName);
}
