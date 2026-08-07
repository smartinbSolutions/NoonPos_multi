const { ipcMain } = require("electron");
import db from "../db";

export default function registerExpenceCategoryIPC() {
  ipcMain.handle("create-expence_category", (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      const result = db
        .prepare(
          `
        INSERT INTO expence_category 
        (name,latinName)
        VALUES (?, ?)
        `
        )
        .run(data.name, data.latinName);

      return {
        success: true,
        id: result.lastInsertRowid,
      };
    } catch (err) {
      console.error("Failed to create expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-expence_category", (event, params = {}) => {
    const { startDate, endDate } = params || {};

    const conditions = [];
    const values = [];

    if (startDate) {
      conditions.push("date(e.date) >= date(?)");
      values.push(startDate);
    }
    if (endDate) {
      conditions.push("date(e.date) <= date(?)");
      values.push(endDate);
    }

    const dateFilter = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      return db
        .prepare(
          `
        SELECT
          ec.id,
          ec.name,
          ec.latinName,
          ec.createdAt,
          COALESCE(filtered.total_spent, 0) AS total_spent,
          COALESCE(filtered.items_count, 0) AS items_count,
          COUNT(ei.id) AS total_items_count
        FROM expence_category ec
        LEFT JOIN expense_items ei ON ei.category_id = ec.id
        LEFT JOIN (
          SELECT
            ei.category_id,
            SUM(ei.price) AS total_spent,
            COUNT(ei.id) AS items_count
          FROM expense_items ei
          JOIN expense e ON e.id = ei.expense_id
          ${dateFilter}
          GROUP BY ei.category_id
        ) filtered ON filtered.category_id = ec.id
        GROUP BY ec.id
        ORDER BY total_spent DESC, ec.id DESC
        `
        )
        .all(...values);
    } catch (err) {
      console.error("Failed to load expense categories:", err);
      return [];
    }
  });

  ipcMain.handle("get-expense-category-items", (event, params = {}) => {
    const { categoryId, page = 1, limit = 20, startDate, endDate } = params;

    if (!categoryId) {
      return {
        data: [],
        page: 1,
        limit,
        total: 0,
        totalPages: 1,
        totalSpent: 0,
      };
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const perPage = Math.max(1, Number(limit) || 20);
    const offset = (currentPage - 1) * perPage;

    const dateConditions = [];
    const dateValues = [];

    if (startDate) {
      dateConditions.push("date(e.date) >= date(?)");
      dateValues.push(startDate);
    }
    if (endDate) {
      dateConditions.push("date(e.date) <= date(?)");
      dateValues.push(endDate);
    }
    const dateFilter = dateConditions.length
      ? `AND ${dateConditions.join(" AND ")}`
      : "";

    const rows = db
      .prepare(
        `
        SELECT
          ei.id,
          ei.expense_id,
          ei.price,
          ei.total,
          ei.discount,
          ei.discount_rate,
          ei.tax_rate,
          ei.taxValue,
          ei.description,
          e.date,
          e.invoice_name,
          e.supplier_id,
          s.name AS supplier_name,
          t.name AS tax_name
        FROM expense_items ei
        JOIN expense e ON e.id = ei.expense_id
        LEFT JOIN suppliers s ON s.id = e.supplier_id
        LEFT JOIN taxes t ON t.id = ei.tax_id
        WHERE ei.category_id = ? ${dateFilter}
        ORDER BY e.date DESC, ei.id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(categoryId, ...dateValues, perPage, offset);

    const { total, totalSpent } = db
      .prepare(
        `
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(ei.total), 0) AS totalSpent
        FROM expense_items ei
        JOIN expense e ON e.id = ei.expense_id
        WHERE ei.category_id = ? ${dateFilter}
        `
      )
      .get(categoryId, ...dateValues);

    return {
      data: rows,
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      totalSpent,
    };
  });

  ipcMain.handle("get-expence_category-by-id", (event, id) => {
    try {
      return db
        .prepare(
          `
        SELECT *
        FROM expence_category
        WHERE id = ?
        `
        )
        .get(id);
    } catch (err) {
      console.error("Failed to load expense category:", err);
      return null;
    }
  });

  ipcMain.handle("update-expence_category", (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      db.prepare(
        `
        UPDATE expence_category
        SET name = ?, latinName = ?
        WHERE id = ?
        `
      ).run(data.name, data.latinName, data.id);

      return { success: true };
    } catch (err) {
      console.error("Failed to update expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-expence_category", (event, id) => {
    try {
      const usageCount = db
        .prepare(
          `SELECT COUNT(*) as count FROM expense_items WHERE category_id = ?`
        )
        .get(id).count;

      if (usageCount > 0) {
        return { success: false, error: "CATEGORY_IN_USE" };
      }

      db.prepare(
        `
        DELETE FROM expence_category
        WHERE id = ?
        `
      ).run(id);

      return { success: true };
    } catch (err) {
      console.error("Failed to delete expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
