// packages/app/src/renderer/features/settings/hooks/useAllPrinterSettings.js
import { useCallback, useEffect, useState } from "react";

export default function useAllPrinterSettings({
  enabled = true,
  administratorId,
} = {}) {
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!administratorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.api.getAllPrinterSettings({ administratorId });
      if (res?.success) {
        setTerminals(res.data);
      } else {
        setError(res?.error || "LOAD_FAILED");
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [administratorId]);

  useEffect(() => {
    if (enabled) fetchAll();
  }, [enabled, fetchAll]);

  return { terminals, loading, error, refresh: fetchAll };
}
