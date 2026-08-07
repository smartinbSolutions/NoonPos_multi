import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export function getLicenseFilePath() {
  return path.join(app.getPath("userData"), "license.dat");
}

export default async function readLicenseFile() {
  try {
    const licenseJson = await fs.readFile(getLicenseFilePath(), "utf8");
    return JSON.parse(licenseJson);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
