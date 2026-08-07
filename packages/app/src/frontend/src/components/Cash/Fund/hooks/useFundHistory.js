import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDefaultDateRange } from "../../../../Global/dateDefaults";

export default function useFundHistory(fundId) {
  const { t } = useTranslation();
  const api = window.api;

  const [history, setHistory] = useState([]);
  const [fund, setFund] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);

  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const refetch = useCallback(async () => {
    if (!api || !fundId) return;

    setLoading(true);
    setError("");

    try {
      const [fundResult, historyResult] = await Promise.all([
        api.getFund(fundId),
        api.getFundHistory({
          fundId,
          page,
          limit,
          startDate: dateRange.startDate || undefined,
          endDate: dateRange.endDate || undefined,
        }),
      ]);

      setFund(fundResult || null);
      setHistory(historyResult?.data || []);
      setTotal(historyResult?.total || 0);
      setTotalPages(historyResult?.totalPages || 1);
      setTotalIn(historyResult?.totalIn || 0);
      setTotalOut(historyResult?.totalOut || 0);
    } catch (err) {
      console.error("Failed to load fund history:", err);
      setError(err?.message || t("errors.loadError"));
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [api, fundId, page, limit, dateRange, t]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const clearDateRange = () => {
    setDateRange({ startDate: "", endDate: "" });
    setPage(1);
  };

  const updateDateRange = (patch) => {
    setDateRange((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const exportExcel = async (range) => {
    setExporting(true);
    setExportError("");
    try {
      const res = await api.exportFundHistoryExcel({
        fundId,
        startDate: range?.startDate || undefined,
        endDate: range?.endDate || undefined,
        language: range?.language || undefined,
      });
      if (!res?.success) {
        setExportError(res?.error || t("errors.exportFailed"));
      }
      return res;
    } catch (err) {
      setExportError(err?.message || t("errors.exportFailed"));
      return { success: false, error: err?.message };
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async (range) => {
    setExporting(true);
    setExportError("");
    try {
      const res = await api.exportFundHistoryPdf({
        fundId,
        startDate: range?.startDate || undefined,
        endDate: range?.endDate || undefined,
        language: range?.language || undefined,
      });
      if (!res?.success) {
        setExportError(res?.error || t("errors.exportFailed"));
      }
      return res;
    } catch (err) {
      setExportError(err?.message || t("errors.exportFailed"));
      return { success: false, error: err?.message };
    } finally {
      setExporting(false);
    }
  };

  return {
    history,
    fund,
    loading,
    error,
    refetch,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    totalIn,
    totalOut,
    dateRange,
    updateDateRange,
    clearDateRange,
    exporting,
    exportError,
    exportExcel,
    exportPdf,
  };
}
