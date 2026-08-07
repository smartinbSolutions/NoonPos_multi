// packages/db-setup/platform/windows.js
// Note: password generation is platform-agnostic and lives in
// packages/db-setup/credentials.js — import it from there, not here.
import fs from "node:fs";
import path from "node:path";

// ---- Paths -----------------------------------------------------------

export function getPaths() {
  return {
    dataDir: "C:\\ProgramData\\NoonPos\\pgdata",
    // binDir is the DESTINATION — where the bundled Postgres binaries get
    // copied TO on the customer's machine, not where they ship inside
    // your app bundle. See getBundledBinSourceDir() for the source.
    binDir: "C:\\Program Files\\NoonPos\\pgbin\\bin",
    installDir: "C:\\Program Files\\NoonPos\\pgbin",
    configDir: "C:\\ProgramData\\NoonPos\\config",
  };
}

/**
 * Returns the SOURCE directory containing the bundled Postgres binaries
 * inside the app/installer itself. Windows only ships one architecture
 * (x86_64), unlike Mac's arm64/x64 split.
 *
 * appResourcesPath is the app's own resources directory (e.g.
 * process.resourcesPath in a packaged Electron app, or a path relative
 * to packages/db-setup during development).
 */
export function getBundledBinSourceDir(appResourcesPath) {
  return path.join(appResourcesPath, "bin", "win");
}

/**
 * Idempotently copies the bundled Postgres binaries from inside the app
 * to the install destination on the customer's machine. Safe to call
 * multiple times — skips the copy if the destination already has the
 * expected postgres.exe in place.
 */
export function ensureBinariesInstalled(appResourcesPath) {
  const { installDir, binDir } = getPaths();
  const alreadyInstalled = fs.existsSync(path.join(binDir, "postgres.exe"));

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
 */
export function getInitdbCommand(dataDir, pwfilePath) {
  const { binDir } = getPaths();
  return {
    exe: `${binDir}\\initdb.exe`,
    args: ["-D", dataDir, "-U", "postgres", `--pwfile=${pwfilePath}`],
  };
}

// ---- Service registration ------------------------------------------------

export function getServiceRegisterCommand(dataDir) {
  const { binDir } = getPaths();
  return {
    exe: `${binDir}\\pg_ctl.exe`,
    args: ["register", "-N", "NoonPosPostgres", "-D", dataDir, "-w"],
  };
}

export function getServiceStartCommand() {
  return {
    exe: "net.exe",
    args: ["start", "NoonPosPostgres"],
  };
}

export function isServiceRegisteredCommand() {
  // Caller inspects stdout for "NoonPosPostgres" to decide if it exists.
  return {
    exe: "sc.exe",
    args: ["query", "NoonPosPostgres"],
  };
}

// ---- Firewall --------------------------------------------------------

export function getFirewallCommand(port) {
  return {
    exe: "netsh.exe",
    args: [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      "name=NoonPos Postgres",
      "dir=in",
      "action=allow",
      "protocol=TCP",
      `localport=${port}`,
    ],
  };
}

export function isFirewallRuleConfiguredCommand() {
  return {
    exe: "netsh.exe",
    args: ["advfirewall", "firewall", "show", "rule", "name=NoonPos Postgres"],
  };
}

// ---- Config file lockdown -----------------------------------------------

/**
 * Restricts the config directory (containing the superuser password file)
 * so only Administrators and SYSTEM can read it — removes inherited
 * access for regular/standard users.
 */
export function getLockdownConfigCommand(configDir) {
  return {
    exe: "icacls.exe",
    args: [
      configDir,
      "/inheritance:r", // strip inherited permissions
      "/grant:r",
      "Administrators:(OI)(CI)F",
      "/grant:r",
      "SYSTEM:(OI)(CI)F",
    ],
  };
}
