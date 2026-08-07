// packages/db-setup/platform/mac.js

// ---- Paths -----------------------------------------------------------

export function getPaths() {
  return {
    dataDir: "/Library/Application Support/NoonPos/pgdata",
    binDir: "/Library/Application Support/NoonPos/pgbin/bin",
    configDir: "/Library/Application Support/NoonPos/config",
  };
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
    exe: `${binDir}/initdb`,
    args: ["-D", dataDir, "-U", "postgres", `--pwfile=${pwfilePath}`],
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
