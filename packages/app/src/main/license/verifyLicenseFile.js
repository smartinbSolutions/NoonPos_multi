import crypto from "node:crypto";
import publicKey from "../../keys/public.pem?raw";
import getDeviceHash from "./getDeviceHash";
import readLicenseFile from "./readLicenseFile";
import { checkClockIntegrity } from "./checkClockIntegrity";

function verifySignature(license) {
  const payloadString = JSON.stringify(license.payload);

  try {
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(payloadString),
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(license.signature, "base64")
    );
  } catch {
    return false;
  }
}

export default async function verifyLicenseFile() {
  const license = await readLicenseFile();

  if (!license?.payload || !license?.signature) {
    return { valid: false, reason: "missing_license" };
  }

  if (!verifySignature(license)) {
    return { valid: false, reason: "invalid_signature" };
  }

  const currentDeviceHash = await getDeviceHash();

  if (license.payload.deviceHash !== currentDeviceHash) {
    return { valid: false, reason: "wrong_device" };
  }

  const { clockRolledBack } = await checkClockIntegrity();

  if (clockRolledBack) {
    return { valid: false, reason: "clock_tampered" };
  }

  if (
    license.payload.expiresAt &&
    new Date(license.payload.expiresAt).getTime() <= Date.now()
  ) {
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    reason: "valid",
    payload: license.payload,
  };
}
