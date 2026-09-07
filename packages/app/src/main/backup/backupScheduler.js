import { getBackupSettings, runBackupNow } from "./backupMeta.service";
import { uploadCloudBackup } from "./cloudBackup.service";

const CHECK_INTERVAL_MS = 60 * 1000;

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

  return true;
}

async function checkAndRun() {
  const settingsResult = getBackupSettings();

  if (!settingsResult.success || !settingsResult.data) return;

  const settings = settingsResult.data;

  // Reads from the shared database, so once any terminal successfully
  // records a backup today, every other terminal's next tick sees the
  // updated last_backup_at and skips — this is what prevents every open
  // terminal from firing its own duplicate scheduled backup.
  if (alreadyRanToday(settings.last_backup_at)) return;
  if (!isScheduledNow(settings)) return;

  await runBackupNow({});

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
  if (intervalHandle) return;
  intervalHandle = setInterval(checkAndRun, CHECK_INTERVAL_MS);
}

export function stopBackupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
