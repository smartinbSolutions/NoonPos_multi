import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

export default function usePrinterSettings({ enabled = true } = {}) {
  const { t } = useTranslation();
  const api = window.api;

  const [savedPrinters, setSavedPrinters] = useState([]);
  const [detectedPrinters, setDetectedPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [savingId, setSavingId] = useState(null); // device_name currently saving
  const [testingId, setTestingId] = useState(null); // device_name currently testing
  const [testResults, setTestResults] = useState({}); // { [device_name]: {success, error, message} }

  const refetch = useCallback(async () => {
    if (!api) return;
    try {
      setLoading(true);
      const res = await api.getPrinterSettings();
      setSavedPrinters(res?.success ? res.data : []);
    } catch (err) {
      console.error("Failed to load printer settings:", err);
      toast.error(t("errors.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  // Only fetches when enabled — lets a caller (like a status-check row)
  // mount this hook without triggering IPC calls every render before the
  // user has actually opened the printer settings modal.
  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);

  const detectPrinters = async () => {
    if (!api) return;
    try {
      setDetecting(true);
      const res = await api.listPrinters();
      setDetectedPrinters(res?.success ? res.data : []);
      if (!res?.success) {
        toast.error(res?.error || t("errors.loadError"));
      }
    } catch (err) {
      console.error("Failed to detect printers:", err);
      toast.error(err?.message || t("errors.loadError"));
    } finally {
      setDetecting(false);
    }
  };

  // Adds a newly detected printer to saved settings with placeholder
  // defaults — never defaults to is_default:true, since a printer must
  // pass a test print before it can become the active default.
  const addDetectedPrinter = async (deviceName) => {
    if (
      !deviceName ||
      savedPrinters.some((p) => p.device_name === deviceName)
    ) {
      return;
    }
    await savePrinter({
      device_name: deviceName,
      paper_size: "80mm",
      backend: "electron",
      has_cutter: true,
      is_default: false,
    });
  };

  const savePrinter = async (data) => {
    if (!api) return;
    try {
      setSavingId(data.device_name);
      const res = await api.savePrinterSettings(data);
      if (res?.success) {
        await refetch();
      } else {
        toast.error(res?.error || t("errors.saveError"));
      }
    } catch (err) {
      console.error("Failed to save printer settings:", err);
      toast.error(err?.message || t("errors.saveError"));
    } finally {
      setSavingId(null);
    }
  };

  const deletePrinter = async (id, deviceName) => {
    if (!api) return;
    try {
      const res = await api.deletePrinterSettings(id);
      if (res?.success) {
        setTestResults((current) => {
          const next = { ...current };
          delete next[deviceName];
          return next;
        });
        await refetch();
      } else {
        toast.error(res?.error || t("errors.deleteError"));
      }
    } catch (err) {
      console.error("Failed to delete printer settings:", err);
      toast.error(err?.message || t("errors.deleteError"));
    }
  };

  const testPrinter = async (deviceName) => {
    if (!api) return;
    try {
      setTestingId(deviceName);
      const res = await api.testPrint(deviceName);
      setTestResults((current) => ({ ...current, [deviceName]: res }));
      if (res?.success) {
        toast.success(t("screens.printers.testSuccess", "Test print sent"));
      } else {
        toast.error(
          res?.error || t("screens.printers.testFailed", "Test print failed"),
        );
      }
    } catch (err) {
      console.error("Test print failed:", err);
      const result = { success: false, error: err?.message };
      setTestResults((current) => ({ ...current, [deviceName]: result }));
      toast.error(
        err?.message || t("screens.printers.testFailed", "Test print failed"),
      );
    } finally {
      setTestingId(null);
    }
  };

  // Setting a printer as default is a distinct action from saving its
  // config — gated on a successful test result for THIS printer, since an
  // untested default is exactly how a real checkout silently fails later.
  const setAsDefault = async (printer) => {
    if (!testResults[printer.device_name]?.success) return;
    await savePrinter({ ...printer, is_default: true });
  };

  const canSetDefault = (deviceName) =>
    Boolean(testResults[deviceName]?.success);

  return {
    savedPrinters,
    detectedPrinters,
    loading,
    detecting,
    savingId,
    testingId,
    testResults,
    detectPrinters,
    addDetectedPrinter,
    savePrinter,
    deletePrinter,
    testPrinter,
    setAsDefault,
    canSetDefault,
    refetch,
  };
}
