// packages/db-setup/platform/mac.js
import fs from "node:fs";
import path from "node:path";

// ---- Paths -----------------------------------------------------------

export function getPaths() {
  return {
    dataDir: "/Library/Application Support/NoonPos/pgdata",
    // binDir is the DESTINATION — where the bundled Postgres binaries get
    // copied TO on the customer's machine, not where they ship inside
    // your app bundle. See getBundledBinSourceDir() for the source.
    binDir: "/Library/Application Support/NoonPos/pgbin/bin",
    installDir: "/Library/Application Support/NoonPos/pgbin",
    configDir: "/Library/Application Support/NoonPos/config",
  };
}

/**
 * Returns the SOURCE directory containing the bundled Postgres binaries
 * inside the app/installer itself, picking the right folder for the
 * current Mac architecture (Apple Silicon vs Intel).
 */
export function getBundledBinSourceDir(appResourcesPath) {
  const archFolder = process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  return path.join(appResourcesPath, "bin", archFolder);
}

/**
 * Idempotently copies the bundled Postgres binaries from inside the app
 * to the install destination on the customer's machine. Safe to call
 * multiple times — skips the copy if the destination already has the
 * expected postgres binary in place.
 */
export function ensureBinariesInstalled(appResourcesPath) {
  const { installDir, binDir } = getPaths();
  const alreadyInstalled = fs.existsSync(path.join(binDir, "postgres"));

  if (alreadyInstalled) {
    return { copied: false, installDir };
  }

  const sourceDir = getBundledBinSourceDir(appResourcesPath);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(
      `[db-setup] Bundled Postgres binaries not found at "${sourceDir}". ` +
        `Expected the installer to include this folder.`
    );
  }

  fs.mkdirSync(installDir, { recursive: true });
  fs.cpSync(sourceDir, installDir, { recursive: true });

  return { copied: true, installDir };
}

// ---- initdb --------------------------------------------------------------

/**
 * Returns the exe + args needed to run initdb.
 * pwfilePath must point to a temp file containing ONLY the password
 * (caller is responsible for creating + deleting that temp file).
 *
 * --encoding=UTF8 --locale=C: forces UTF8 regardless of the host
 * machine's OS locale, for the same reason as the Windows platform
 * file — without this, initdb's encoding choice depends on the local
 * machine's locale, which can silently break Arabic/Turkish storage.
 */
export function getInitdbCommand(dataDir, pwfilePath) {
  const { binDir } = getPaths();
  return {
    exe: `${binDir}/initdb`,
    args: [
      "-D",
      dataDir,
      "-U",
      "postgres",
      `--pwfile=${pwfilePath}`,
      "--encoding=UTF8",
      "--locale=C",
    ],
  };
}

// ---- Service registration ------------------------------------------------
// macOS uses launchd instead of a native "service" concept like Windows.
// We register a LaunchDaemon (system-wide, starts on boot, no user login
// required) rather than a LaunchAgent (per-user, only runs while logged in) —
// a DB host needs to run regardless of whether anyone is logged in.

const LAUNCH_DAEMON_LABEL = "com.smartinb.noonpos.postgres";
const LAUNCH_DAEMON_PLIST_PATH = `/Library/LaunchDaemons/${LAUNCH_DAEMON_LABEL}.plist`;

export function getLaunchDaemonPlistPath() {
  return LAUNCH_DAEMON_PLIST_PATH;
}

/**
 * Returns the actual plist XML content to write to disk.
 * launchd reads this file to know how to run/keep-alive Postgres.
 */
export function getLaunchDaemonPlistContents(dataDir) {
  const { binDir } = getPaths();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binDir}/postgres</string>
    <string>-D</string>
    <string>${dataDir}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>UserName</key>
  <string>_noonpos_pg</string>
  <key>StandardOutPath</key>
  <string>/Library/Logs/NoonPos/postgres.log</string>
  <key>StandardErrorPath</key>
  <string>/Library/Logs/NoonPos/postgres-error.log</string>
</dict>
</plist>
`;
}

export function getServiceRegisterCommand() {
  // Loading the LaunchDaemon is what actually "registers + starts" it.
  return {
    exe: "launchctl",
    args: ["load", "-w", LAUNCH_DAEMON_PLIST_PATH],
  };
}

export function getServiceStartCommand() {
  return {
    exe: "launchctl",
    args: ["kickstart", "-k", `system/${LAUNCH_DAEMON_LABEL}`],
  };
}

export function isServiceRegisteredCommand() {
  // Caller checks stdout for the label to decide if it's already loaded.
  return {
    exe: "launchctl",
    args: ["list", LAUNCH_DAEMON_LABEL],
  };
}

// ---- Firewall --------------------------------------------------------
// macOS doesn't have a scriptable equivalent of `netsh` for this case.
// The built-in Application Firewall (socketfilterfw) only gates whether
// an *application* may accept incoming connections at all — it doesn't
// do per-port rules the way Windows Firewall does. In practice, allowing
// the bundled `postgres` binary through it is the only lever we have.

export function getFirewallCommand() {
  const { binDir } = getPaths();
  return {
    exe: "/usr/libexec/ApplicationFirewall/socketfilterfw",
    args: ["--add", `${binDir}/postgres`, "--unblockapp", `${binDir}/postgres`],
  };
}

export function isFirewallRuleConfiguredCommand() {
  return {
    exe: "/usr/libexec/ApplicationFirewall/socketfilterfw",
    args: ["--listapps"],
    // Caller inspects stdout for the postgres binary path to decide.
  };
}

// ---- Config file lockdown -----------------------------------------------

/**
 * Restricts the config directory (containing the superuser password file)
 * so only root can read it. chmod 700 on the dir + chmod 600 on files
 * (files are already written with mode 0o600 by configStore.js) —
 * this just locks down the directory itself and ownership.
 */
export function getLockdownConfigCommand(configDir) {
  return {
    exe: "chmod",
    args: ["700", configDir],
  };
}

export function getLockdownConfigOwnerCommand(configDir) {
  return {
    exe: "chown",
    args: ["-R", "root:wheel", configDir],
  };
}