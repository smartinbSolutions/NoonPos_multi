// packages/app/src/main/db/dbConnectionConfig.js
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function getConfigPath() {
  return path.join(app.getPath("userData"), "db-connection.json");
}

export function hasDbConfig() {
  return fs.existsSync(getConfigPath());
}

export function loadDbConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function saveDbConfig(config) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function clearDbConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.rmSync(configPath);
  }
}

// Backup/restore only make sense to run against the local Postgres
// instance directly — a guest terminal connects to the host's LAN IP,
// so this machine only counts as the host when the stored config points
// at itself (localhost), which is exactly what NoonPos-DBSetup.exe
// writes for the app running on the host machine.
export function isDbHostMachine() {
  const config = loadDbConfig();
  if (!config) return false;
  return config.host === "127.0.0.1" || config.host === "localhost";
}
