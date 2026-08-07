import { app } from "electron";
import path from "node:path";

export function getLastSeenPath() {
  return path.join(app.getPath("userData"), "last_seen.dat");
}
