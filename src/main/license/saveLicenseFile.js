import fs from "node:fs/promises";
import path from "node:path";
import { getLicenseFilePath } from "./readLicenseFile";

export default async function saveLicenseFile(license) {
  const licenseFilePath = getLicenseFilePath();

  await fs.mkdir(path.dirname(licenseFilePath), { recursive: true });
  await fs.writeFile(licenseFilePath, JSON.stringify(license, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });

  return licenseFilePath;
}
