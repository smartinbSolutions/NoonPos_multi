import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import verifyLicenseFile from "../../main/license/verifyLicenseFile.js";
import getDeviceHash from "../../main/license/getDeviceHash";
import { pgDumpBackup } from "./pgBackup.service.js";

const UPLOAD_URL = "https://panel-server.smartinb.com/api/backups/upload";
const LIST_URL = "https://panel-server.smartinb.com/api/backups/list";
const DOWNLOAD_URL_BASE =
  "https://panel-server.smartinb.com/api/backups/download";

/**
 * Creates a fresh snapshot of the main database and uploads it to the
 * license server's cloud backup endpoint. Independent of local backup —
 * always makes its own pg_dump, per the deliberate choice to keep the two
 * features decoupled rather than sharing a file. Available from any
 * terminal — pg_dump connects to the host over the network the same way
 * every other query already does, and doesn't need to run on the host
 * machine itself.
 */
export async function uploadCloudBackup() {
  const status = await verifyLicenseFile();

  if (!status.valid) {
    return { success: false, error: "LICENSE_INVALID" };
  }

  if (!status.payload.features?.includes("cloud_backup")) {
    return { success: false, error: "CLOUD_BACKUP_NOT_INCLUDED" };
  }

  const licenseKey = status.payload.licenseKey;
  const deviceHash = await getDeviceHash();
  const tmpFolder = os.tmpdir();

  let tmpPath = null;

  try {
    const dumpResult = await pgDumpBackup({ targetFolder: tmpFolder });
    if (!dumpResult.success) {
      return { success: false, error: dumpResult.error };
    }
    tmpPath = dumpResult.filePath;

    const fileBuffer = await fs.readFile(tmpPath);

    const formData = new FormData();
    formData.append("licenseKey", licenseKey);
    formData.append("deviceHash", deviceHash);
    formData.append("file", new Blob([fileBuffer]), path.basename(tmpPath));

    let response;
    try {
      response = await fetch(UPLOAD_URL, {
        method: "POST",
        body: formData,
      });
    } catch (networkErr) {
      return {
        success: false,
        error: "NETWORK_ERROR",
        message: networkErr.message,
      };
    }

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      // Surface the server's own error code (e.g. "already_uploaded_today",
      // "device_not_activated") rather than a generic failure — the caller
      // (scheduler or manual button) needs to distinguish "already done
      // today, this is fine" from an actual problem.
      return {
        success: false,
        error: result?.error || "UPLOAD_FAILED",
        httpStatus: response.status,
      };
    }

    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }
}

/**
 * Lists this device's cloud backups, most recent first — used to populate
 * the cloud section of the restore UI.
 */
export async function listCloudBackups() {
  const status = await verifyLicenseFile();

  if (!status.valid) {
    return { success: false, error: "LICENSE_INVALID" };
  }

  const licenseKey = status.payload.licenseKey;
  const deviceHash = await getDeviceHash();

  const url = `${LIST_URL}?licenseKey=${encodeURIComponent(licenseKey)}&deviceHash=${encodeURIComponent(deviceHash)}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: networkErr.message,
    };
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      error: result?.error || "LIST_FAILED",
      httpStatus: response.status,
    };
  }

  return { success: true, data: result.backups };
}

/**
 * Downloads one cloud backup to a local temp file and returns its path —
 * the caller feeds that path straight into the restore flow, which
 * doesn't care whether the .dump file came from disk or the cloud.
 */
export async function downloadCloudBackup(backupId) {
  const status = await verifyLicenseFile();

  if (!status.valid) {
    return { success: false, error: "LICENSE_INVALID" };
  }

  const licenseKey = status.payload.licenseKey;
  const deviceHash = await getDeviceHash();

  const url = `${DOWNLOAD_URL_BASE}/${encodeURIComponent(backupId)}?licenseKey=${encodeURIComponent(licenseKey)}&deviceHash=${encodeURIComponent(deviceHash)}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    return {
      success: false,
      error: "NETWORK_ERROR",
      message: networkErr.message,
    };
  }

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    return {
      success: false,
      error: result?.error || "DOWNLOAD_FAILED",
      httpStatus: response.status,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const tmpPath = path.join(
    os.tmpdir(),
    `noonpos-cloud-restore-${Date.now()}.dump`,
  );

  await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));

  return { success: true, filePath: tmpPath };
}
