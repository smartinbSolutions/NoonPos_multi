// reportsIpc.js
import { ipcMain } from "electron";
import db from "../db";
import {
  getProfitLoss,
  getProfitLossTrend,
  getExpenseCategoryBreakdown,
  getSalesSummary,
  getSalesByProduct,
  getSalesByCustomer,
  getSalesTrend,
} from "../services/reports.service";

// ---------------------------------------------------------------------------
// getPreviousPeriod — given a start/end date, returns the immediately
// preceding period of the same length (no gap). Shared by any report that
// needs period-over-period comparison.
// ---------------------------------------------------------------------------
function getPreviousPeriod(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const lengthMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);

  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  };
}

function calculatePercentChange(current, previous) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ---------------------------------------------------------------------------
// resolveDateRange — shared "default to last 30 days if nothing passed"
// logic, used by both report handlers so they behave identically when
// opened with no explicit range.
// ---------------------------------------------------------------------------
function resolveDateRange(startDate, endDate) {
  const effectiveEnd = endDate || new Date().toISOString().slice(0, 10);
  const effectiveStart =
    startDate ||
    new Date(new Date(effectiveEnd).getTime() - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
  return { effectiveStart, effectiveEnd };
}

export default function registerReportsIPC() {
  ipcMain.handle(
    "get-profit-loss-report",
    (event, { startDate, endDate } = {}) => {
      try {
        const { effectiveStart, effectiveEnd } = resolveDateRange(
          startDate,
          endDate
        );

        if (isNaN(new Date(effectiveStart)) || isNaN(new Date(effectiveEnd))) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }
        if (new Date(effectiveStart) > new Date(effectiveEnd)) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }

        const { prevStart, prevEnd } = getPreviousPeriod(
          effectiveStart,
          effectiveEnd
        );

        const current = getProfitLoss(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });
        const previous = getProfitLoss(db, {
          startDate: prevStart,
          endDate: prevEnd,
        });

        const changePercent = {
          salesTotal: calculatePercentChange(
            current.sales.total,
            previous.sales.total
          ),
          expenseTotal: calculatePercentChange(
            current.expense.total,
            previous.expense.total
          ),
          grossProfit: calculatePercentChange(
            current.profitLoss.grossProfit,
            previous.profitLoss.grossProfit
          ),
          netProfit: calculatePercentChange(
            current.profitLoss.netProfit,
            previous.profitLoss.netProfit
          ),
        };

        const trend = getProfitLossTrend(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });

        const expenseBreakdown = getExpenseCategoryBreakdown(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });

        return {
          range: { startDate: effectiveStart, endDate: effectiveEnd },
          previousRange: { startDate: prevStart, endDate: prevEnd },
          current,
          previous,
          changePercent,
          trend,
          expenseBreakdown,
        };
      } catch (err) {
        console.error("get-profit-loss-report failed:", err);
        return { success: false, error: "REPORT_GENERATION_FAILED" };
      }
    }
  );

  // -------------------------------------------------------------------------
  // get-sales-report — summary + by-product + by-customer + trend.
  ipcMain.handle(
    "get-sales-report",
    (event, { startDate, endDate, productLimit, customerLimit } = {}) => {
      try {
        const { effectiveStart, effectiveEnd } = resolveDateRange(
          startDate,
          endDate
        );

        if (isNaN(new Date(effectiveStart)) || isNaN(new Date(effectiveEnd))) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }
        if (new Date(effectiveStart) > new Date(effectiveEnd)) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }

        const summary = getSalesSummary(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });

        const byProduct = getSalesByProduct(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
          // undefined -> helper's own default (20) kicks in; null passes
          // through as "no limit" per getSalesByProduct's own convention.
          limit: productLimit,
        });

        const byCustomer = getSalesByCustomer(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
          limit: customerLimit,
        });

        const trend = getSalesTrend(db, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });

        return {
          range: { startDate: effectiveStart, endDate: effectiveEnd },
          summary,
          byProduct,
          byCustomer,
          trend,
        };
      } catch (err) {
        console.error("get-sales-report failed:", err);
        return { success: false, error: "REPORT_GENERATION_FAILED" };
      }
    }
  );
}
