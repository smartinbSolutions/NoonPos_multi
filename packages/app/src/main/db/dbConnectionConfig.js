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
