import { getBackupSettings, runBackupNow } from "./backupMeta.service";
import { uploadCloudBackup } from "./cloudBackup.service";
import { isDbHostMachine } from "../../db/dbConnectionConfig.js";

const CHECK_INTERVAL_MS = 60 * 1000; // check once a minute — cheap, and
// keeps the "already ran today" logic simple (see below) without needing
// a heavier cron-style library for what is just daily/weekly granularity.

let intervalHandle = null;

function alreadyRanToday(lastBackupAt) {
  if (!lastBackupAt) return false;
  const last = new Date(lastBackupAt);
  const now = new Date();
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate()
  );
}

function isScheduledNow(settings) {
  if (!settings || !settings.schedule_enabled) return false;
  if (!settings.schedule_time) return false;

  const [scheduledHour, scheduledMinute] = settings.schedule_time
    .split(":")
    .map(Number);

  const now = new Date();
  const matchesTime =
    now.getHours() === scheduledHour && now.getMinutes() === scheduledMinute;

  if (!matchesTime) return false;

  if (settings.schedule_frequency === "weekly") {
    return now.getDay() === settings.schedule_day_of_week;
  }

  // 'daily' — time match alone is enough
  return true;
}

async function checkAndRun() {
  // Backup/restore can only run where pg_dump/pg_restore are actually
  // installed — the host machine that ran NoonPos-DBSetup.exe. A guest
  // terminal's scheduler tick is a silent no-op; only the host's own
  // background scheduler should ever attempt this.
  if (!isDbHostMachine()) return;

  const settingsResult = getBackupSettings();

  if (!settingsResult.success || !settingsResult.data) return;

  const settings = settingsResult.data;

  //   if (alreadyRanToday(settings.last_backup_at)) return;
  if (!isScheduledNow(settings)) return;

  await runBackupNow({});

  // Cloud upload rides the same schedule as local backup — no separate
  // cloud-specific schedule config. uploadCloudBackup() already checks
  // license validity and the cloud_backup feature internally, so on an
  // unentitled license this just resolves to a quiet no-op result; only
  // genuine failures (network, server errors) are worth logging here,
  // since a background scheduler has no UI to surface anything to.
  try {
    const cloudResult = await uploadCloudBackup();
    if (
      !cloudResult.success &&
      cloudResult.error !== "CLOUD_BACKUP_NOT_INCLUDED" &&
      cloudResult.error !== "already_uploaded_today"
    ) {
      console.error("Scheduled cloud backup upload failed:", cloudResult);
    }
  } catch (err) {
    console.error("Scheduled cloud backup upload threw:", err);
  }
}

export function startBackupScheduler() {
  if (intervalHandle) return; // already running — don't double-schedule
  intervalHandle = setInterval(checkAndRun, CHECK_INTERVAL_MS);
}

export function stopBackupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
