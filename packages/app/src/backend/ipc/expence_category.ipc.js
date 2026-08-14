// packages/app/src/backend/expenseCategory.ipc.js
import { ipcMain } from "electron";
import { query } from "../dbConnect.js";

export default function registerExpenceCategoryIPC() {
  ipcMain.handle("create-expence_category", async (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      const { rows } = await query(
        `INSERT INTO expense_category (name, latin_name)
         VALUES ($1, $2)
         RETURNING id`,
        [data.name, data.latinName],
      );

      return { success: true, id: rows[0].id };
    } catch (err) {
      console.error("Failed to create expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-expence_category", async (event, params = {}) => {
    const { startDate, endDate } = params || {};

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`e.date::date >= $${paramIndex}::date`);
      values.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      conditions.push(`e.date::date <= $${paramIndex}::date`);
      values.push(endDate);
      paramIndex++;
    }

    const dateFilter = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    try {
      const { rows } = await query(
        `SELECT
          ec.id,
          ec.name,
          ec.latin_name,
          ec.created_at,
          COALESCE(filtered.total_spent, 0) AS total_spent,
          COALESCE(filtered.items_count, 0) AS items_count,
          COUNT(ei.id) AS total_items_count
        FROM expense_category ec
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
        GROUP BY ec.id, filtered.total_spent, filtered.items_count
        ORDER BY total_spent DESC, ec.id DESC`,
        values,
      );
      return rows;
    } catch (err) {
      console.error("Failed to load expense categories:", err);
      return [];
    }
  });

  ipcMain.handle("get-expense-category-items", async (event, params = {}) => {
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
    let paramIndex = 2; // $1 is categoryId

    if (startDate) {
      dateConditions.push(`e.date::date >= $${paramIndex}::date`);
      dateValues.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateConditions.push(`e.date::date <= $${paramIndex}::date`);
      dateValues.push(endDate);
      paramIndex++;
    }
    const dateFilter = dateConditions.length
      ? `AND ${dateConditions.join(" AND ")}`
      : "";

    const { rows } = await query(
      `SELECT
        ei.id,
        ei.expense_id,
        ei.price,
        ei.total,
        ei.discount,
        ei.discount_rate,
        ei.tax_rate,
        ei.tax_value,
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
      WHERE ei.category_id = $1 ${dateFilter}
      ORDER BY e.date DESC, ei.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [categoryId, ...dateValues, perPage, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(ei.total), 0) AS "totalSpent"
      FROM expense_items ei
      JOIN expense e ON e.id = ei.expense_id
      WHERE ei.category_id = $1 ${dateFilter}`,
      [categoryId, ...dateValues],
    );
    const total = Number(totalRows[0].total);
    const totalSpent = totalRows[0].totalSpent;

    return {
      data: rows,
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      totalSpent,
    };
  });

  ipcMain.handle("get-expence_category-by-id", async (event, id) => {
    try {
      const { rows } = await query(
        "SELECT * FROM expense_category WHERE id = $1",
        [id],
      );
      return rows[0];
    } catch (err) {
      console.error("Failed to load expense category:", err);
      return null;
    }
  });

  ipcMain.handle("update-expence_category", async (event, data) => {
    if (!data.name) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    try {
      await query(
        `UPDATE expense_category
         SET name = $1, latin_name = $2
         WHERE id = $3`,
        [data.name, data.latinName, data.id],
      );

      return { success: true };
    } catch (err) {
      console.error("Failed to update expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("delete-expence_category", async (event, id) => {
    try {
      const { rows } = await query(
        `SELECT COUNT(*) as count FROM expense_items WHERE category_id = $1`,
        [id],
      );

      if (Number(rows[0].count) > 0) {
        return { success: false, error: "CATEGORY_IN_USE" };
      }

      await query("DELETE FROM expense_category WHERE id = $1", [id]);

      return { success: true };
    } catch (err) {
      console.error("Failed to delete expense category:", err);
      return { success: false, error: err.message || String(err) };
    }
  });
}
