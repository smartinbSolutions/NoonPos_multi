// packages/db-setup/steps/configureNetworking.js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

async function loadPlatformModule() {
  if (process.platform === "win32") {
    return import("../platform/windows.js");
  }
  if (process.platform === "darwin") {
    return import("../platform/mac.js");
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

const LISTEN_MARKER = "# noonpos-networking-configured";

/**
 * Idempotently configures Postgres itself to accept connections from
 * other machines on the network. The firewall rule alone (configureFirewall.js)
 * only controls whether traffic can REACH this machine — Postgres's own
 * config separately controls whether it ACCEPTS that traffic once it
 * arrives. By default (fresh initdb), Postgres only listens on localhost
 * and only trusts connections from 127.0.0.1, so without this step other
 * terminals would connect to the right IP/port and simply get silently
 * ignored, not even a clear "connection refused".
 *
 * Restarts the Postgres service at the end, since these settings only
 * take effect on (re)start.
 *
 * Safe to call multiple times — checks for a marker comment before
 * editing either config file.
 */
export async function configureNetworking(dataDir) {
  const postgresqlConfPath = path.join(dataDir, "postgresql.conf");
  const pgHbaConfPath = path.join(dataDir, "pg_hba.conf");

  const alreadyConfigured = isAlreadyConfigured(postgresqlConfPath);

  if (alreadyConfigured) {
    console.log("[db-setup] Network access already configured, skipping.");
    return { alreadyConfigured: true };
  }

  console.log("[db-setup] Configuring Postgres for network access...");

  updateListenAddresses(postgresqlConfPath);
  updatePgHba(pgHbaConfPath);
  await restartService();

  console.log("[db-setup] Network access configured.");
  return { alreadyConfigured: false };
}

function isAlreadyConfigured(postgresqlConfPath) {
  if (!fs.existsSync(postgresqlConfPath)) return false;
  const contents = fs.readFileSync(postgresqlConfPath, "utf-8");
  return contents.includes(LISTEN_MARKER);
}

function updateListenAddresses(postgresqlConfPath) {
  let contents = fs.readFileSync(postgresqlConfPath, "utf-8");

  // The default line is commented out: "#listen_addresses = 'localhost'".
  // Rather than trying to pattern-match and replace it in place (fragile
  // across Postgres versions' exact formatting), append an override at
  // the end of the file — Postgres uses the LAST occurrence of a setting
  // when a file has duplicates, so this reliably wins regardless of
  // what's above it.
  contents += `\n${LISTEN_MARKER}\nlisten_addresses = '*'\n`;

  fs.writeFileSync(postgresqlConfPath, contents, "utf-8");
}

function updatePgHba(pgHbaConfPath) {
  let contents = fs.readFileSync(pgHbaConfPath, "utf-8");

  // Allow password-authenticated connections from any address. Scoped to
  // scram-sha-256 (Postgres's modern password hashing), not "trust" —
  // every connection still requires the real password, this only opens
  // WHICH addresses are allowed to try.
  //
  // Deliberately broad (0.0.0.0/0) rather than guessing the LAN subnet:
  // this host might be reached over Wi-Fi or Ethernet, DHCP ranges vary,
  // and the firewall rule (configureFirewall.js) plus the password
  // requirement here are the actual security boundary — this line only
  // controls reachability, matching how we reasoned about the firewall
  // rule being the real protection, not obscurity.
  contents += `\n${LISTEN_MARKER}\nhost all all 0.0.0.0/0 scram-sha-256\nhost all all ::/0 scram-sha-256\n`;

  fs.writeFileSync(pgHbaConfPath, contents, "utf-8");
}

async function restartService() {
  const platform = await loadPlatformModule();

  if (process.platform === "win32") {
    const stopCmd = { exe: "net.exe", args: ["stop", "NoonPosPostgres"] };
    const startCmd = platform.getServiceStartCommand();
    try {
      execFileSync(stopCmd.exe, stopCmd.args, { stdio: "inherit" });
    } catch {
      // May already be stopped — not a real failure, same reasoning as
      // registerService.js's forgiving start-command handling.
    }
    execFileSync(startCmd.exe, startCmd.args, { stdio: "inherit" });
    return;
  }

  if (process.platform === "darwin") {
    const startCmd = platform.getServiceStartCommand();
    execFileSync(startCmd.exe, startCmd.args, { stdio: "inherit" });
    return;
  }
}
