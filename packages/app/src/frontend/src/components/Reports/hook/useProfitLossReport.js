import { useState, useEffect, useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// Date helpers — kept dependency-free since the rest of the app doesn't pull
// in a date library (Dashboard.jsx does its own plain-Date + Intl formatting).
// All ranges are returned as "YYYY-MM-DD" strings, matching what the backend's
// date(...) SQL comparisons expect.
// ---------------------------------------------------------------------------
const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function getPresetRange(preset) {
  const today = new Date();
  // Normalize to local midnight so day-math below doesn't drift across DST
  // or partial-day timestamps.
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  switch (preset) {
    case "last7Days": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6); // -6 so today is the 7th day, inclusive
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
      // Day 0 of "this month" rolls back to the last day of the previous
      // month — a small JS Date quirk used deliberately here.
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: toISODate(start), endDate: toISODate(end) };
    }
    case "thisYear": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { startDate: toISODate(start), endDate: toISODate(startOfToday) };
    }
    default:
      // "custom" — caller keeps whatever dates are already set, this preset
      // has no computed range of its own.
      return null;
  }
}

// Exposed so the component can render preset buttons without duplicating
// the list of keys. labelKey resolves through i18n in the component.
export const REPORT_PRESETS = [
  { key: "last7Days", labelKey: "reports.presets.last7Days" },
  { key: "thisMonth", labelKey: "reports.presets.thisMonth" },
  { key: "lastMonth", labelKey: "reports.presets.lastMonth" },
  { key: "thisYear", labelKey: "reports.presets.thisYear" },
  { key: "custom", labelKey: "reports.presets.custom" },
];

export default function useProfitLossReport() {
  // "thisMonth" is the sensible default landing view — most owners opening
  // a P&L report want "how's this month going", not an empty custom range.
  const [preset, setPresetState] = useState("thisMonth");

  const initialRange = getPresetRange("thisMonth");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Clicking a preset button recomputes both dates from scratch.
  const setPreset = useCallback((nextPreset) => {
    setPresetState(nextPreset);
    const range = getPresetRange(nextPreset);
    if (range) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
    // "custom" -> range is null -> dates stay as they were, so switching
    // *to* custom never blanks out the inputs.
  }, []);

  // Typing in either date input implicitly switches the preset to "custom".
  // Without this, a preset button would stay highlighted while showing a
  // date range that no longer matches it — confusing to look at.
  const setCustomStartDate = useCallback((value) => {
    setPresetState("custom");
    setStartDate(value);
  }, []);

  const setCustomEndDate = useCallback((value) => {
    setPresetState("custom");
    setEndDate(value);
  }, []);

  const isRangeValid = useMemo(
    () => Boolean(startDate && endDate && startDate <= endDate),
    [startDate, endDate]
  );

  const fetchReport = useCallback(async () => {
    if (!isRangeValid) return;

    try {
      setLoading(true);
      setError("");
      const res = await window.api.getProfitLossReport({ startDate, endDate });

      // The IPC handler returns either the raw report shape, or
      // { success: false, error: CODE } on failure — no `.data` wrapper
      // either way, so branch on `success` rather than unwrapping.
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
  }, [startDate, endDate, isRangeValid]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return {
    // date range controls
    preset,
    setPreset,
    startDate,
    endDate,
    setCustomStartDate,
    setCustomEndDate,
    isRangeValid,

    // report data
    data,
    loading,
    error,
    refetch: fetchReport,
  };
}
