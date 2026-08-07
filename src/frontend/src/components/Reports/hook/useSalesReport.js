import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Date-range preset logic — same approach as useProfitLossReport.js
// (local-calendar YYYY-MM-DD strings, never toISOString() which shifts by a
// day in timezones ahead of UTC). Duplicated here rather than imported,
// since the two hooks' state shapes diverge enough (this one also tracks
// productLimit/customerLimit) that sharing would mean threading extra
// params through — if a third report hook shows up, this is the point to
// extract a common useDateRangePresets() hook instead of copying a third
// time.
// ---------------------------------------------------------------------------
const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function getPresetRange(preset) {
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  switch (preset) {
    case "last7Days": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { startDate: toISODate(start), endDate: toISODate(startOfToday) };
    }
    case "last30Days": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { startDate: toISODate(start), endDate: toISODate(startOfToday) };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toISODate(start), endDate: toISODate(startOfToday) };
    }
    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: toISODate(start), endDate: toISODate(end) };
    }
    case "thisYear": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { startDate: toISODate(start), endDate: toISODate(startOfToday) };
    }
    default:
      return null;
  }
}

export const SALES_REPORT_PRESETS = [
  { key: "last7Days", labelKey: "reports.presets.last7Days" },
  { key: "thisMonth", labelKey: "reports.presets.thisMonth" },
  { key: "lastMonth", labelKey: "reports.presets.lastMonth" },
  { key: "thisYear", labelKey: "reports.presets.thisYear" },
  { key: "custom", labelKey: "reports.presets.custom" },
];

// Matches the backend's own default (getSalesByProduct/getSalesByCustomer
// both default limit to 20) — kept as a named constant here so the "Show
// all" toggle has something explicit to compare against and reset to.
const DEFAULT_ROW_LIMIT = 20;

export default function useSalesReport() {
  const [preset, setPresetState] = useState("thisMonth");
  const initialRange = getPresetRange("thisMonth");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);

  // Each table's "show all" is independent — expanding the product table
  // shouldn't force the customer table to expand too.
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const setPreset = useCallback((nextPreset) => {
    setPresetState(nextPreset);
    const range = getPresetRange(nextPreset);
    if (range) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, []);

  const setCustomStartDate = useCallback((value) => {
    setPresetState("custom");
    setStartDate(value);
  }, []);

  const setCustomEndDate = useCallback((value) => {
    setPresetState("custom");
    setEndDate(value);
  }, []);

  const isRangeValid = Boolean(startDate && endDate && startDate <= endDate);

  const fetchReport = useCallback(async () => {
    if (!isRangeValid) return;

    try {
      setLoading(true);
      setError("");
      const res = await window.api.getSalesReport({
        startDate,
        endDate,
        // null explicitly requests "no limit" per the backend's own
        // convention — omitting the key entirely would leave it undefined,
        // which the IPC handler passes straight through, and the service
        // function's own default (20) would kick in instead. Being
        // explicit here means toggling "show all" always means what it says.
        productLimit: showAllProducts ? null : DEFAULT_ROW_LIMIT,
        customerLimit: showAllCustomers ? null : DEFAULT_ROW_LIMIT,
      });

      if (res?.success === false) {
        setError(res.error || "REPORT_GENERATION_FAILED");
        setData(null);
      } else {
        setData(res);
      }
    } catch (err) {
      console.error(err);
      setError("REPORT_GENERATION_FAILED");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, isRangeValid, showAllProducts, showAllCustomers]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return {
    preset,
    setPreset,
    startDate,
    endDate,
    setCustomStartDate,
    setCustomEndDate,
    isRangeValid,

    showAllProducts,
    setShowAllProducts,
    showAllCustomers,
    setShowAllCustomers,

    data,
    loading,
    error,
    refetch: fetchReport,
  };
}
