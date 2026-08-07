// packages/db-setup/credentials.js
// Platform-agnostic — password generation doesn't differ by OS,
// so this lives outside platform/ and is imported by both.
import crypto from "node:crypto";

export function generateSuperuserPassword() {
  return crypto.randomBytes(24).toString("base64url");
}
