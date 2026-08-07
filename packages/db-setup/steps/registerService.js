// packages/db-setup/steps/registerService.js
import { execFileSync } from "node:child_process";
import fs from "node:fs";

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
 * Idempotently ensures Postgres is registered as a background service
 * (starts on boot, runs without anyone logged in) and that it's
 * currently running. Safe to call multiple times.
 *
 * Requires initDataDirectory() to have already run — this step assumes
 * the data directory already exists and is initialized.
 */
export async function registerService(dataDir) {
  const platform = await loadPlatformModule();

  // --- Idempotency check -------------------------------------------------
  const alreadyRegistered = isServiceAlreadyRegistered(platform);

  if (alreadyRegistered) {
    console.log(
      "[db-setup] Service already registered, skipping registration."
    );
  } else {
    registerNewService(platform, dataDir);
  }

  // --- Make sure it's actually running, either way ------------------------
  // Registration alone doesn't guarantee it's running right now (e.g. it
  // could be registered but stopped from a previous session) — always
  // (re)issue a start command. Both platforms' start commands are safe to
  // run even if the service is already running.
  ensureServiceRunning(platform);

  console.log("[db-setup] Service is registered and running.");
  return { alreadyRegistered };
}

function isServiceAlreadyRegistered(platform) {
  const { exe, args } = platform.isServiceRegisteredCommand();
  try {
    const output = execFileSync(exe, args, { encoding: "utf-8" });
    // Windows sc.exe / macOS launchctl list both print nothing useful
    // to check against reliably except "did the command succeed", since
    // an unregistered service causes these commands to exit non-zero.
    return output.length > 0;
  } catch {
    // Non-zero exit code means "not found" on both platforms.
    return false;
  }
}

function registerNewService(platform, dataDir) {
  console.log("[db-setup] Registering Postgres as a background service...");

  if (process.platform === "darwin") {
    // macOS needs the plist file written to disk BEFORE launchctl load
    // can register it — this is the extra step Windows doesn't need.
    const plistPath = platform.getLaunchDaemonPlistPath();
    const plistContents = platform.getLaunchDaemonPlistContents(dataDir);
    fs.writeFileSync(plistPath, plistContents, { mode: 0o644 });
  }

  const { exe, args } = platform.getServiceRegisterCommand(dataDir);
  execFileSync(exe, args, { stdio: "inherit" });
}

function ensureServiceRunning(platform) {
  const { exe, args } = platform.getServiceStartCommand();
  try {
    execFileSync(exe, args, { stdio: "inherit" });
  } catch (err) {
    // Both `net start` (Windows) and `launchctl kickstart` (Mac) can exit
    // non-zero if the service is already running — that's not a real
    // failure, so we don't propagate it. Anything else genuinely wrong
    // (bad data dir, port conflict, etc.) will surface later when we try
    // to connect to Postgres in the next step, which is a clearer signal
    // than trying to parse these commands' inconsistent error output.
    console.log(
      "[db-setup] Start command reported an issue (may already be running):",
      err.message
    );
  }
}
