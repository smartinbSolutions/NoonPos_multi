// packages/db-setup-cli/index.js
import readline from "node:readline/promises";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { setupDatabaseHost } from "@noonpos/db-setup";
import { t } from "./translations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns the machine's actual LAN IPv4 address(es) — the address(es)
 * other devices on the same network would use to reach this machine.
 * Excludes loopback (127.0.0.1) and any non-IPv4 addresses.
 *
 * Returns an array because a machine can have more than one active
 * network adapter (e.g. both Wi-Fi and Ethernet connected at once) —
 * callers should handle the single-address and multiple-address cases
 * differently rather than blindly picking the first one, since picking
 * wrong means giving other devices an address that won't work.
 */
function getLocalNetworkIps() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push({ interfaceName: name, address: entry.address });
      }
    }
  }

  return addresses;
}

function resolveDbSetupResourcesPath() {
  const dbSetupPkgPath = new URL(
    import.meta.resolve("@noonpos/db-setup/package.json")
  );
  return path.dirname(fileURLToPath(dbSetupPkgPath));
}

async function ask(rl, question) {
  return (await rl.question(question)).trim();
}

async function chooseLanguage(rl) {
  const answer = await ask(rl, `${t("en", "languagePrompt")}: `);
  if (answer === "2" || answer.toLowerCase() === "ar") return "ar";
  if (answer === "3" || answer.toLowerCase() === "tr") return "tr";
  return "en";
}

async function confirm(rl, lang) {
  const answer = await ask(
    rl,
    `${t(lang, "confirmPrompt")} ${t(lang, "yesNoHint")} `
  );
  return answer.toLowerCase() === "y";
}

function writeConnectionInfoFile(lang, credentials) {
  const outputPath = path.join(process.cwd(), "noonpos-connection.txt");
  const detectedIps = getLocalNetworkIps();

  let hostLine;
  if (credentials.host !== "127.0.0.1") {
    // Caller already resolved a specific host address — trust it as-is.
    hostLine = credentials.host;
  } else if (detectedIps.length === 1) {
    // Exactly one candidate — safe to use directly.
    hostLine = detectedIps[0].address;
  } else if (detectedIps.length > 1) {
    // More than one active network adapter (e.g. Wi-Fi + Ethernet both
    // connected) — list all of them rather than guessing which is the
    // one other devices will actually reach this machine through.
    hostLine =
      detectedIps.map((ip) => `${ip.address} (${ip.interfaceName})`).join(" ") +
      `\n${t(lang, "multipleIpsNote")}`;
  } else {
    // Detection found nothing usable — fall back to the manual instructions.
    hostLine = t(lang, "connectionFileThisMachine");
  }

  const contents = `${t(lang, "connectionFileTitle")}
=================================
${t(lang, "connectionFileIntro")}

${t(lang, "connectionFileHost")} ${hostLine}
${t(lang, "connectionFilePort")} ${credentials.port}
${t(lang, "connectionFileDatabase")} ${credentials.database}
${t(lang, "connectionFileUser")} ${credentials.user}
${t(lang, "connectionFilePassword")} ${credentials.password}

${t(lang, "connectionFileNote")}
`;
  fs.writeFileSync(outputPath, contents, { mode: 0o600 });
  return outputPath;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const lang = await chooseLanguage(rl);

    console.log("");
    console.log("=================================");
    console.log(` ${t(lang, "title")}`);
    console.log("=================================");
    console.log("");
    console.log(t(lang, "introLine1"));
    console.log(`  - ${t(lang, "introBullet1")}`);
    console.log(`  - ${t(lang, "introBullet2")}`);
    console.log(`  - ${t(lang, "introBullet3")}`);
    console.log(`  - ${t(lang, "introBullet4")}`);
    console.log("");

    const proceed = await confirm(rl, lang);
    if (!proceed) {
      console.log(t(lang, "cancelled"));
      return;
    }

    console.log("");

    const appResourcesPath = resolveDbSetupResourcesPath();
    const credentials = await setupDatabaseHost(appResourcesPath);

    console.log("");
    console.log("=================================");
    console.log(` ${t(lang, "setupComplete")}`);
    console.log("=================================");

    const outputPath = writeConnectionInfoFile(lang, credentials);
    console.log("");
    console.log(`${t(lang, "connectionSaved")} ${outputPath}`);
    console.log(t(lang, "connectionSavedNote"));
  } catch (err) {
    console.log("");
    console.error("=================================");
    console.error(" Setup FAILED");
    console.error("=================================");
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
