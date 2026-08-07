import fs from "node:fs/promises";
import { getLastSeenPath } from "./getLastSeenPath";

const TOLERANCE_MS = 5 * 60 * 1000;

export async function checkClockIntegrity() {
  const lastSeenPath = getLastSeenPath();
  const now = Date.now();

  let lastSeen = 0;
  try {
    lastSeen = Number(await fs.readFile(lastSeenPath, "utf8"));
  } catch {
    // no file yet — first run
  }

  const clockRolledBack = lastSeen && now < lastSeen - TOLERANCE_MS;

  await fs.writeFile(lastSeenPath, String(Math.max(now, lastSeen)), "utf8");

  return { clockRolledBack, now, lastSeen };
}
