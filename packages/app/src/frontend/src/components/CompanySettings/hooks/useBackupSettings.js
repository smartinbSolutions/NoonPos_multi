import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

export default function useBackupSettings({ enabled = true } = {}) {
  const { t } = useTranslation();
  const api = window.api;

  const [settings, setSettings] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const [uploadingCloud, setUploadingCloud] = useState(false);
  const [cloudBackups, setCloudBackups] = useState([]);
  const [loadingCloudBackups, setLoadingCloudBackups] = useState(false);
  const [downloadingCloudId, setDownloadingCloudId] = useState(null);

  const refetchSettings = useCallback(async () => {
    if (!api) return;
    try {
      setLoading(true);
      const res = await api.getBackupSettings();
      setSettings(res?.success ? res.data : null);
    } catch (err) {
      console.error("Failed to load backup settings:", err);
      toast.error(t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  const refetchBackups = useCallback(async () => {
    if (!api) return;
    try {
      setLoadingBackups(true);
      const res = await api.listBackups();
      if (res?.success) {
        setBackups(res.data);
      } else {
        setBackups([]);
        if (res?.error && res.error !== "NO_BACKUP_FOLDER_CONFIGURED") {
          toast.error(t(`errors.${res.error}`, res.error));
        }
      }
    } catch (err) {
      console.error("Failed to list backups:", err);
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }, [api, t]);

  const refetchCloudBackups = useCallback(async () => {
    if (!api?.listCloudBackups) return;
    try {
      setLoadingCloudBackups(true);
      const res = await api.listCloudBackups();
      if (res?.success) {
        setCloudBackups(res.data);
      } else {
        setCloudBackups([]);
        if (res?.error && res.error !== "LICENSE_INVALID") {
          toast.error(t(`errors.${res.error}`, res.error));
        }
      }
    } catch (err) {
      console.error("Failed to list cloud backups:", err);
      setCloudBackups([]);
    } finally {
      setLoadingCloudBackups(false);
    }
  }, [api, t]);

  useEffect(() => {
    if (enabled) {
      refetchSettings();
      refetchBackups();
      refetchCloudBackups();
    }
  }, [enabled, refetchSettings, refetchBackups, refetchCloudBackups]);

  const updateSettings = async (data) => {
    if (!api) return;
    try {
      setSavingSettings(true);
      const res = await api.updateBackupSettings(data);
      if (res?.success) {
        await refetchSettings();
      } else {
        toast.error(
          res?.error
            ? t(`errors.${res.error}`, res.error)
            : t("errors.saveError"),
        );
      }
      return res;
    } catch (err) {
      console.error("Failed to update backup settings:", err);
      toast.error(err?.message || t("errors.saveError"));
      return { success: false, error: err?.message };
    } finally {
      setSavingSettings(false);
    }
  };

  const chooseAndSaveFolder = async () => {
    if (!api) return;
    const picked = await api.chooseBackupFolder();
    if (!picked?.success) return picked;
    return updateSettings({ defaultFolder: picked.folder });
  };

  const chooseRestoreFile = async () => {
    if (!api) return null;
    const picked = await api.chooseRestoreFile();
    if (!picked?.success) return null;
    return picked.filePath;
  };

  const createBackupNow = async () => {
    if (!api) return;
    try {
      setCreating(true);
      const res = await api.createBackup();
      if (res?.success) {
        toast.success(t("screens.backup.createSuccess", "Backup created"));
        await refetchSettings();
        await refetchBackups();
      } else {
        toast.error(
          res?.error
            ? t(`errors.${res.error}`, res.error)
            : t("screens.backup.createFailed", "Backup failed"),
        );
      }
      return res;
    } catch (err) {
      console.error("Backup creation failed:", err);
      toast.error(
        err?.message || t("screens.backup.createFailed", "Backup failed"),
      );
      return { success: false, error: err?.message };
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async ({
    filePath,
    administratorId,
    administratorPin,
    recoveryKey,
    administratorUsername,
  }) => {
    if (!api) return { success: false, error: "NO_API" };
    try {
      setRestoring(true);
      const res = await api.restoreBackup({
        backupFilePath: filePath,
        administratorId,
        administratorPin,
        recoveryKey,
        administratorUsername,
      });
      if (!res?.success) {
        toast.error(
          res?.error
            ? t(`errors.${res.error}`, res.error)
            : t("screens.backup.restoreFailed", "Restore failed"),
        );
      }
      return res;
    } catch (err) {
      console.error("Restore failed:", err);
      toast.error(
        err?.message || t("screens.backup.restoreFailed", "Restore failed"),
      );
      return { success: false, error: err?.message };
    } finally {
      setRestoring(false);
    }
  };

  const uploadToCloudNow = async () => {
    if (!api) return;
    try {
      setUploadingCloud(true);
      const res = await api.uploadCloudBackup();

      if (res?.success) {
        toast.success(
          t("screens.backup.cloudUploadSuccess", "Uploaded to cloud"),
        );
        await refetchCloudBackups();
      } else if (res?.error === "already_uploaded_today") {
        toast.info(
          t(
            "screens.backup.cloudAlreadyUploadedToday",
            "Already backed up to the cloud today",
          ),
        );
      } else {
        toast.error(
          res?.error
            ? t(`errors.${res.error}`, res.error)
            : t("screens.backup.cloudUploadFailed", "Cloud upload failed"),
        );
      }
      return res;
    } catch (err) {
      console.error("Cloud upload failed:", err);
      toast.error(
        err?.message ||
          t("screens.backup.cloudUploadFailed", "Cloud upload failed"),
      );
      return { success: false, error: err?.message };
    } finally {
      setUploadingCloud(false);
    }
  };

  const downloadCloudBackupForRestore = async (backupId, fileName) => {
    if (!api?.downloadCloudBackup) return null;
    try {
      setDownloadingCloudId(backupId);
      const res = await api.downloadCloudBackup(backupId);
      if (!res?.success) {
        toast.error(
          res?.error
            ? t(`errors.${res.error}`, res.error)
            : t("screens.backup.cloudDownloadFailed", "Download failed"),
        );
        return null;
      }
      return { filePath: res.filePath, fileName };
    } catch (err) {
      console.error("Cloud backup download failed:", err);
      toast.error(
        err?.message ||
          t("screens.backup.cloudDownloadFailed", "Download failed"),
      );
      return null;
    } finally {
      setDownloadingCloudId(null);
    }
  };

  return {
    settings,
    loading,
    savingSettings,
    updateSettings,
    chooseAndSaveFolder,
    chooseRestoreFile,
    refetchSettings,

    backups,
    loadingBackups,
    creating,
    restoring,
    createBackupNow,
    restoreBackup,
    refetchBackups,

    uploadingCloud,
    cloudBackups,
    loadingCloudBackups,
    downloadingCloudId,
    uploadToCloudNow,
    refetchCloudBackups,
    downloadCloudBackupForRestore,
  };
}
