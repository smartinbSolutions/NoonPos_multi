// reportsIpc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";
import {
  getProfitLoss,
  getProfitLossTrend,
  getExpenseCategoryBreakdown,
  getSalesSummary,
  getSalesByProduct,
  getSalesByCustomer,
  getSalesTrend,
} from "../services/reports.service";

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
    async (event, { startDate, endDate } = {}) => {
      try {
        const { effectiveStart, effectiveEnd } = resolveDateRange(
          startDate,
          endDate,
        );

        if (isNaN(new Date(effectiveStart)) || isNaN(new Date(effectiveEnd))) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }
        if (new Date(effectiveStart) > new Date(effectiveEnd)) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }

        const { prevStart, prevEnd } = getPreviousPeriod(
          effectiveStart,
          effectiveEnd,
        );

        const current = await getProfitLoss(query, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });
        const previous = await getProfitLoss(query, {
          startDate: prevStart,
          endDate: prevEnd,
        });

        const changePercent = {
          salesTotal: calculatePercentChange(
            current.sales.total,
            previous.sales.total,
          ),
          expenseTotal: calculatePercentChange(
            current.expense.total,
            previous.expense.total,
          ),
          grossProfit: calculatePercentChange(
            current.profitLoss.grossProfit,
            previous.profitLoss.grossProfit,
          ),
          netProfit: calculatePercentChange(
            current.profitLoss.netProfit,
            previous.profitLoss.netProfit,
          ),
        };

        const trend = await getProfitLossTrend(query, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });
        const expenseBreakdown = await getExpenseCategoryBreakdown(query, {
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
    },
  );

  ipcMain.handle(
    "get-sales-report",
    async (event, { startDate, endDate, productLimit, customerLimit } = {}) => {
      try {
        const { effectiveStart, effectiveEnd } = resolveDateRange(
          startDate,
          endDate,
        );

        if (isNaN(new Date(effectiveStart)) || isNaN(new Date(effectiveEnd))) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }
        if (new Date(effectiveStart) > new Date(effectiveEnd)) {
          return { success: false, error: "INVALID_DATE_RANGE" };
        }

        const summary = await getSalesSummary(query, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
        });

        const byProduct = await getSalesByProduct(query, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
          limit: productLimit,
        });

        const byCustomer = await getSalesByCustomer(query, {
          startDate: effectiveStart,
          endDate: effectiveEnd,
          limit: customerLimit,
        });

        const trend = await getSalesTrend(query, {
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
    },
  );
}
