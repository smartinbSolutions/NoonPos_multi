// packages/db-setup/steps/configureFirewall.js
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

/**
 * Idempotently ensures the Postgres port is reachable through the OS
 * firewall from other devices on the LAN. Safe to call multiple times.
 */
export async function configureFirewall(port = 5432) {
  const platform = await loadPlatformModule();

  const alreadyConfigured = isFirewallAlreadyConfigured(platform);

  if (alreadyConfigured) {
    console.log("[db-setup] Firewall rule already configured, skipping.");
    return { alreadyConfigured: true };
  }

  console.log("[db-setup] Opening firewall for Postgres...");
  const { exe, args } = platform.getFirewallCommand(port);
  execFileSync(exe, args, { stdio: "inherit" });

  console.log("[db-setup] Firewall configured.");
  return { alreadyConfigured: false };
}

function isFirewallAlreadyConfigured(platform) {
  const { exe, args } = platform.isFirewallRuleConfiguredCommand();
  try {
    const output = execFileSync(exe, args, { encoding: "utf-8" });

    if (process.platform === "win32") {
      // netsh prints "No rules match the specified criteria." when the
      // rule doesn't exist — anything else means it found the rule.
      return !output.includes("No rules match");
    }

    if (process.platform === "darwin") {
      // socketfilterfw --listapps prints the allowed app paths — check
      // if our bundled postgres binary appears anywhere in that list.
      return output.toLowerCase().includes("postgres");
    }

    return false;
  } catch {
    // Non-zero exit code — treat as "not configured" rather than a hard
    // failure, consistent with how we handle the other idempotency
    // checks (registerService.js follows the same pattern).
    return false;
  }
}
