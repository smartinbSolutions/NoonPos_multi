// seedLastSeenFromServerTime.js
import fs from "node:fs/promises";
import { getLastSeenPath } from "./getLastSeenPath";

export default async function seedLastSeenFromServerTime(issuedAt) {
  const serverTimestamp = new Date(issuedAt).getTime();
  const lastSeenPath = getLastSeenPath();

  let existing = 0;
  try {
    existing = Number(await fs.readFile(lastSeenPath, "utf8"));
  } catch {
    // no file yet — normal for first activation
  }

  // Never move the ratchet backward — only raise it to the server's
  // trusted time if that's later than whatever's already stored.
  await fs.writeFile(
    lastSeenPath,
    String(Math.max(serverTimestamp, existing)),
    "utf8"
  );
}
