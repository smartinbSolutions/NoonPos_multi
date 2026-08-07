// packages/db-setup/configStore.js
import fs from "node:fs";
import path from "node:path";

function getConfigPath(platformPaths) {
  return path.join(platformPaths.configDir, "pg-admin.json");
}

export function saveAdminConfig(platformPaths, data) {
  const configPath = getConfigPath(platformPaths);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  // mode 0o600 = owner read/write only, no access for group/others (Unix-style;
  // on Windows this is a weaker hint, so we'll layer icacls on top next)
}

export function loadAdminConfig(platformPaths) {
  const configPath = getConfigPath(platformPaths);
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function adminConfigExists(platformPaths) {
  return fs.existsSync(getConfigPath(platformPaths));
}
