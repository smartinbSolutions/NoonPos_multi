import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  DatabaseBackup,
  FolderOpen,
  Clock,
  RotateCcw,
  FileSearch,
  HardDriveDownload,
  Cloud,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useBackupSettings from "../hooks/useBackupSettings";
import RestoreConfirmModal from "./RestoreConfirmModal";
import { useLicense } from "../../../Global/LicenseContext";

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      dir="ltr"
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? "bg-[#4663ff]" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-gray-50/60 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function BackupRow({
  backup,
  dateValue,
  sizeValue,
  onRestoreClick,
  restoringLabel,
  isRestoring,
}) {
  const { t, i18n } = useTranslation();
  const date = new Date(dateValue);
  const formatted = date.toLocaleString(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-gray-800">{formatted}</p>
        <p className="text-xs text-slate-400">{formatBytes(sizeValue)}</p>
      </div>
      <button
        type="button"
        onClick={() => onRestoreClick(backup)}
        disabled={isRestoring}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCcw size={13} />
        {isRestoring ? restoringLabel : t("screens.backup.restore", "Restore")}
      </button>
    </div>
  );
}

export default function BackupSettingsModal({ isOpen, onClose }) {
  const { t, i18n } = useTranslation();
  const hook = useBackupSettings({ enabled: isOpen });
  const { hasFeature } = useLicense();
  const cloudBackupEnabled = hasFeature("cloud_backup");
  const {
    settings,
    backups,
    loading,
    loadingBackups,
    savingSettings,
    creating,
    uploadingCloud,
    cloudBackups,
    loadingCloudBackups,
    downloadingCloudId,
    updateSettings,
    chooseAndSaveFolder,
    chooseRestoreFile,
    createBackupNow,
    uploadToCloudNow,
    downloadCloudBackupForRestore,
  } = hook;

  const [activeTab, setActiveTab] = useState("local");
  const [restoreTarget, setRestoreTarget] = useState(null);

  if (!isOpen) return null;

  const scheduleEnabled = Boolean(settings?.schedule_enabled);
  const scheduleFrequency = settings?.schedule_frequency || "daily";
  const scheduleTime = settings?.schedule_time || "";
  const scheduleDayOfWeek =
    settings?.schedule_day_of_week === null ||
    settings?.schedule_day_of_week === undefined
      ? 0
      : settings.schedule_day_of_week;

  const weekdayLabel = (dayIndex) =>
    new Date(2024, 0, dayIndex + 7).toLocaleDateString(i18n.language, {
      weekday: "long",
    });

  const handleBrowseForFile = async () => {
    const filePath = await chooseRestoreFile();
    if (!filePath) return;
    const fileName = filePath.split(/[\\/]/).pop();
    setRestoreTarget({ filePath, fileName });
  };

  const handleCloudRestoreClick = async (backup) => {
    const result = await downloadCloudBackupForRestore(
      backup.id,
      backup.fileName,
    );
    if (!result) return;
    setRestoreTarget(result);
  };

  const tabButtonClass = (tab) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
      activeTab === tab
        ? "border-[#4663ff] bg-[#eef3ff] text-[#4663ff]"
        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
    }`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1c2340]/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_rgba(28,35,64,0.35)]">
        <div className="flex items-center justify-between border-b border-[#e9edfb] bg-[linear-gradient(135deg,#eef3ff_0%,#f8faff_100%)] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4663ff]/10 text-[#4663ff]">
              <DatabaseBackup size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-950">
                {t("screens.backup.title", "Database backups")}
              </h2>
              <p className="text-xs text-slate-500">
                {t(
                  "screens.backup.hint",
                  "Keep your data safe and recoverable.",
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-[#eef3ff] hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 px-6 py-10">
            <p className="text-center text-xs text-slate-400">
              {t("common.loading")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b border-[#e9edfb] px-6 pb-4 pt-4">
              <button
                type="button"
                onClick={() => setActiveTab("local")}
                className={tabButtonClass("local")}
              >
                <HardDriveDownload size={14} />
                {t("screens.backup.tabLocal", "Local")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("cloud")}
                className={tabButtonClass("cloud")}
              >
                {cloudBackupEnabled ? <Cloud size={14} /> : <Lock size={13} />}
                {t("screens.backup.tabCloud", "Cloud")}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {activeTab === "local" && (
                <div className="space-y-4">
                  <SectionCard>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      <FolderOpen size={12} />
                      {t("screens.backup.folder", "Backup folder")}
                    </label>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">
                        {settings?.default_folder ||
                          t("screens.backup.noFolder", "Not set")}
                      </p>
                      <button
                        type="button"
                        onClick={chooseAndSaveFolder}
                        disabled={savingSettings}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                      >
                        {t("screens.backup.chooseFolder", "Choose")}
                      </button>
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                        <Clock size={14} />
                        {t(
                          "screens.backup.scheduleEnabled",
                          "Automatic backups",
                        )}
                      </label>
                      <Toggle
                        checked={scheduleEnabled}
                        onChange={() =>
                          updateSettings({ scheduleEnabled: !scheduleEnabled })
                        }
                      />
                    </div>

                    {scheduleEnabled && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <select
                          value={scheduleFrequency}
                          onChange={(e) =>
                            updateSettings({
                              scheduleFrequency: e.target.value,
                            })
                          }
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="daily">
                            {t("screens.backup.daily", "Daily")}
                          </option>
                          <option value="weekly">
                            {t("screens.backup.weekly", "Weekly")}
                          </option>
                        </select>

                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) =>
                            updateSettings({ scheduleTime: e.target.value })
                          }
                          dir="ltr"
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                        />

                        {scheduleFrequency === "weekly" && (
                          <select
                            value={scheduleDayOfWeek}
                            onChange={(e) =>
                              updateSettings({
                                scheduleDayOfWeek: Number(e.target.value),
                              })
                            }
                            className="col-span-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                          >
                            {WEEKDAY_INDEXES.map((day) => (
                              <option key={day} value={day}>
                                {weekdayLabel(day)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </SectionCard>

                  <button
                    type="button"
                    onClick={createBackupNow}
                    disabled={creating}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4663ff] py-2.5 text-sm font-bold text-white shadow-lg shadow-[#4663ff]/20 transition hover:bg-[#3854e8] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <HardDriveDownload size={16} />
                    {creating
                      ? t("screens.backup.creating", "Backing up...")
                      : t("screens.backup.backupNow", "Back up now")}
                  </button>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        {t("screens.backup.available", "Available backups")}
                      </p>
                      <button
                        type="button"
                        onClick={handleBrowseForFile}
                        className="flex items-center gap-1 text-[11px] font-bold text-[#4663ff] hover:text-[#3854e8]"
                      >
                        <FileSearch size={12} />
                        {t(
                          "screens.backup.browseElsewhere",
                          "Browse elsewhere",
                        )}
                      </button>
                    </div>

                    {loadingBackups ? (
                      <p className="text-xs text-slate-400">
                        {t("common.loading")}
                      </p>
                    ) : backups.length > 0 ? (
                      <div className="space-y-2">
                        {backups.map((backup) => (
                          <BackupRow
                            key={backup.filePath}
                            backup={backup}
                            dateValue={backup.mtime}
                            sizeValue={backup.size}
                            onRestoreClick={setRestoreTarget}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {t("screens.backup.empty", "No backups yet.")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "cloud" && (
                <div className="space-y-4">
                  <SectionCard>
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          cloudBackupEnabled
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-200 text-gray-400"
                        }`}
                      >
                        {cloudBackupEnabled ? (
                          <Cloud size={17} />
                        ) : (
                          <Lock size={15} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-gray-800">
                            {t("screens.backup.cloudTitle", "Cloud backup")}
                          </p>
                          {cloudBackupEnabled && (
                            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={10} />
                              {t("screens.backup.cloudIncludedBadge", "Active")}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {cloudBackupEnabled
                            ? t(
                                "screens.backup.cloudIncluded",
                                "Included in your plan.",
                              )
                            : t(
                                "screens.backup.cloudLocked",
                                "Not included in your current plan.",
                              )}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  {cloudBackupEnabled ? (
                    <>
                      <button
                        type="button"
                        onClick={uploadToCloudNow}
                        disabled={uploadingCloud}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Cloud size={16} />
                        {uploadingCloud
                          ? t("screens.backup.cloudUploading", "Uploading...")
                          : t(
                              "screens.backup.cloudUploadNow",
                              "Back up to cloud now",
                            )}
                      </button>

                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          {t("screens.backup.cloudAvailable", "Cloud backups")}
                        </p>

                        {loadingCloudBackups ? (
                          <p className="text-xs text-slate-400">
                            {t("common.loading")}
                          </p>
                        ) : cloudBackups.length > 0 ? (
                          <div className="space-y-2">
                            {cloudBackups.map((backup) => (
                              <BackupRow
                                key={backup.id}
                                backup={backup}
                                dateValue={backup.uploadedAt}
                                sizeValue={backup.sizeBytes}
                                onRestoreClick={handleCloudRestoreClick}
                                isRestoring={downloadingCloudId === backup.id}
                                restoringLabel={t(
                                  "screens.backup.downloading",
                                  "Downloading...",
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">
                            {t(
                              "screens.backup.cloudEmpty",
                              "No cloud backups yet.",
                            )}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-8 text-center">
                      <Lock size={20} className="text-gray-300" />
                      <p className="max-w-[220px] text-xs text-gray-400">
                        {t(
                          "screens.backup.cloudUpsellHint",
                          "Upgrade your plan to back up your data off-site automatically.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <RestoreConfirmModal
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        backup={restoreTarget}
        hook={hook}
      />
    </div>,
    document.body,
  );
}
