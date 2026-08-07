import crypto from "node:crypto";
import { machineId } from "node-machine-id";

export default async function getDeviceHash() {
  const rawMachineId = await machineId();

  return crypto.createHash("sha256").update(rawMachineId).digest("hex");
}
