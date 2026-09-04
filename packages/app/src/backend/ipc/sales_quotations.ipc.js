import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import { buildDefaultInvoiceName } from "../utils/helpers";

export default function registerSalesQuotationsIPC() {
  ipcMain.handle("create-sales-quotation", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (!data.date || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("ERROR ENTER DATA");
      }

      const dateOnly = data.date.slice(0, 10);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const requestedTaxIds = Array.isArray(data.taxes)
        ? [...new Set(data.taxes.filter(Boolean))]
        : [];

      const quotationTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) throw new Error("INVALID_TAX_ID");
        quotationTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const quotationDiscountRate = Math.min(
        100,
        Math.max(0, Number(data.discount_rate || 0)),
      );

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const enteredQuantity = Number(item.entered_quantity || 0);
        const enteredPrice = Number(item.entered_price || 0);
        const factor = Number(item.unit_conversion_factor || 1);

        if (enteredQuantity <= 0 || enteredPrice < 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const baseQuantity = enteredQuantity * factor;
        const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
        const total = enteredQuantity * enteredPrice;

        const discountRate = Math.min(
          100,
          Math.max(0, Number(item.discount_rate || 0)),
        );
        const discount = Number(((total * discountRate) / 100).toFixed(2));
        const afterDiscount = total - discount;

        let taxId = null;
        let taxRate = 0;

        if (item.tax_id) {
          const { rows } = await q(
            `SELECT rate FROM taxes WHERE id = $1 AND category IN ('product', 'both')`,
            [item.tax_id],
          );
          const taxRow = rows[0];
          if (!taxRow) throw new Error("INVALID_ITEM_TAX_ID");
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        preparedItems.push({
          product_id: item.product_id || null,
          product_name: item.name || null,
          product_code: item.code || null,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          basePrice,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue,
          description: item.description || null,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      itemDiscountTotal = Number(itemDiscountTotal.toFixed(2));
      itemTaxTotal = Number(itemTaxTotal.toFixed(2));

      if (subtotal <= 0) throw new Error("INVALID TOTALS");

      const afterItemDiscounts = subtotal - itemDiscountTotal;
      const quotationDiscount = Number(
        ((afterItemDiscounts * quotationDiscountRate) / 100).toFixed(2),
      );
      const afterQuotationDiscount = afterItemDiscounts - quotationDiscount;

      let quotationTaxValueTotal = 0;
      const preparedQuotationTaxes = quotationTaxes.map((tax) => {
        const value = Number(
          ((afterQuotationDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        quotationTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      quotationTaxValueTotal = Number(quotationTaxValueTotal.toFixed(2));

      const quotationTaxRateSum = Number(
        quotationTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterQuotationDiscount + itemTaxTotal + quotationTaxValueTotal,
        ).toFixed(2),
      );

      const quotationResult = await q(
        `INSERT INTO sales_quotations
         (customer_id, quotation_name, description, status, date,
          subtotal, discount, discount_rate, tax_rate, tax_value,
          created_by, updated_by, net_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          data.customer_id || null,
          data.quotation_name?.trim() || null,
          data.description?.trim() || null,
          "draft",
          fullDateTime,
          subtotal,
          quotationDiscount,
          quotationDiscountRate,
          quotationTaxRateSum,
          quotationTaxValueTotal,
          data.created_by || null,
          null,
          netTotal,
        ],
      );
      const quotationId = quotationResult.rows[0].id;

      let quotationName = data.quotation_name?.trim();
      if (!quotationName) {
        quotationName = await buildDefaultInvoiceName(
          q,
          "sales_quotation",
          quotationId,
        );
        await q(
          `UPDATE sales_quotations SET quotation_name = $1 WHERE id = $2`,
          [quotationName, quotationId],
        );
      }

      for (const tax of preparedQuotationTaxes) {
        await q(
          `INSERT INTO sales_quotation_taxes (quotation_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [quotationId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_quotation_items
           (quotation_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, tax_value, discount, discount_rate, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            quotationId,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
            item.total,
            item.product_name,
            item.product_code,
            item.unit_name,
            item.unit_conversion_factor,
            item.tax_id,
            item.tax_rate,
            item.taxValue,
            item.discount,
            item.discount_rate,
            item.description,
          ],
        );
      }

      await client.query("COMMIT");
      return { success: true, quotationId, quotationName };
    } catch (err) {
      await client.query("ROLLBACK");
      return {
        success: false,
        error: err.message || String(err),
        code: err.code,
      };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("update-sales-quotation", async (event, data) => {
    if (
      !data.id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const { rows: oldQuotationRows } = await query(
      "SELECT * FROM sales_quotations WHERE id = $1",
      [data.id],
    );
    const oldQuotation = oldQuotationRows[0];

    if (!oldQuotation) {
      return { success: false, error: "SALES_QUOTATION_NOT_FOUND" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const dateOnly = data.date.slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const requestedTaxIds = Array.isArray(data.taxes)
        ? [...new Set(data.taxes.filter(Boolean))]
        : [];

      const quotationTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) throw new Error("INVALID_TAX_ID");
        quotationTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const quotationDiscountRate = Math.min(
        100,
        Math.max(0, Number(data.discount_rate || 0)),
      );

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        const enteredQuantity = Number(item.entered_quantity || 0);
        const enteredPrice = Number(item.entered_price || 0);
        const factor = Number(item.unit_conversion_factor || 1);

        if (enteredQuantity <= 0 || enteredPrice < 0) {
          throw new Error("INVALID ITEM DATA");
        }

        const baseQuantity = enteredQuantity * factor;
        const basePrice = factor > 0 ? enteredPrice / factor : enteredPrice;
        const total = enteredQuantity * enteredPrice;

        const discountRate = Math.min(
          100,
          Math.max(0, Number(item.discount_rate || 0)),
        );
        const discount = Number(((total * discountRate) / 100).toFixed(2));
        const afterDiscount = total - discount;

        let taxId = null;
        let taxRate = 0;

        if (item.tax_id) {
          const { rows } = await q(
            `SELECT rate FROM taxes WHERE id = $1 AND category IN ('product', 'both')`,
            [item.tax_id],
          );
          const taxRow = rows[0];
          if (!taxRow) throw new Error("INVALID_ITEM_TAX_ID");
          taxId = item.tax_id;
          taxRate = Number(taxRow.rate || 0);
        }

        const taxValue = Number(((afterDiscount * taxRate) / 100).toFixed(2));

        subtotal += total;
        itemDiscountTotal += discount;
        itemTaxTotal += taxValue;

        preparedItems.push({
          product_id: item.product_id || null,
          product_name: item.name || null,
          product_code: item.code || null,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          basePrice,
          total,
          discount_rate: discountRate,
          discount,
          tax_id: taxId,
          tax_rate: taxRate,
          taxValue,
          description: item.description || null,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      itemDiscountTotal = Number(itemDiscountTotal.toFixed(2));
      itemTaxTotal = Number(itemTaxTotal.toFixed(2));

      if (subtotal <= 0) throw new Error("INVALID TOTALS");

      const afterItemDiscounts = subtotal - itemDiscountTotal;
      const quotationDiscount = Number(
        ((afterItemDiscounts * quotationDiscountRate) / 100).toFixed(2),
      );
      const afterQuotationDiscount = afterItemDiscounts - quotationDiscount;

      let quotationTaxValueTotal = 0;
      const preparedQuotationTaxes = quotationTaxes.map((tax) => {
        const value = Number(
          ((afterQuotationDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        quotationTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      quotationTaxValueTotal = Number(quotationTaxValueTotal.toFixed(2));

      const quotationTaxRateSum = Number(
        quotationTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterQuotationDiscount + itemTaxTotal + quotationTaxValueTotal,
        ).toFixed(2),
      );

      await q(`DELETE FROM sales_quotation_items WHERE quotation_id = $1`, [
        data.id,
      ]);
      await q(`DELETE FROM sales_quotation_taxes WHERE quotation_id = $1`, [
        data.id,
      ]);

      for (const tax of preparedQuotationTaxes) {
        await q(
          `INSERT INTO sales_quotation_taxes (quotation_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [data.id, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO sales_quotation_items
           (quotation_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, tax_value, discount, discount_rate, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            data.id,
            item.product_id,
            item.baseQuantity,
            item.basePrice,
            item.total,
            item.product_name,
            item.product_code,
            item.unit_name,
            item.unit_conversion_factor,
            item.tax_id,
            item.tax_rate,
            item.taxValue,
            item.discount,
            item.discount_rate,
            item.description,
          ],
        );
      }

      const quotationName =
        data.quotation_name?.trim() || oldQuotation.quotation_name;

      await q(
        `UPDATE sales_quotations
         SET customer_id = $1, quotation_name = $2, description = $3, status = $4, date = $5,
             subtotal = $6, discount = $7, discount_rate = $8,
             tax_rate = $9, tax_value = $10, net_total = $11, updated_by = $12
         WHERE id = $13`,
        [
          data.customer_id || null,
          quotationName,
          data.description?.trim() || null,
          data.status || oldQuotation.status,
          fullDateTime,
          subtotal,
          quotationDiscount,
          quotationDiscountRate,
          quotationTaxRateSum,
          quotationTaxValueTotal,
          netTotal,
          data.updated_by,
          data.id,
        ],
      );

      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  // GET ALL SALES QUOTATIONS
  ipcMain.handle("get-sales-quotations", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    let paramIndex = 1;

    if (params.dateFrom) {
      whereConditions.push(`q.date::date >= $${paramIndex}::date`);
      whereParams.push(params.dateFrom);
      paramIndex++;
    }
    if (params.dateTo) {
      whereConditions.push(`q.date::date <= $${paramIndex}::date`);
      whereParams.push(params.dateTo);
      paramIndex++;
    }
    if (params.customerId) {
      whereConditions.push(`q.customer_id = $${paramIndex}`);
      whereParams.push(params.customerId);
      paramIndex++;
    }
    if (params.status) {
      whereConditions.push(`q.status = $${paramIndex}`);
      whereParams.push(params.status);
      paramIndex++;
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push(`q.net_total >= $${paramIndex}`);
      whereParams.push(Number(params.minTotal));
      paramIndex++;
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push(`q.net_total <= $${paramIndex}`);
      whereParams.push(Number(params.maxTotal));
      paramIndex++;
    }
    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds
        .map(() => `$${paramIndex++}`)
        .join(",");
      whereConditions.push(`
      EXISTS (
        SELECT 1 FROM sales_quotation_taxes sqt
        WHERE sqt.quotation_id = q.id AND sqt.tax_id IN (${taxPlaceholders})
      )
    `);
      whereParams.push(...params.taxIds);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const { rows: quotations } = await query(
      `SELECT
      q.*,
      q.date::text AS date,
      q.subtotal::float AS subtotal,
      q.discount::float AS discount,
      q.tax_value::float AS tax_value,
      q.net_total::float AS net_total,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      invoiceTaxAgg.taxes_json,

      COALESCE(itemAgg.item_tax_total, 0)::float AS item_tax_total,
      COALESCE(itemAgg.item_discount_total, 0)::float AS item_discount_total,
      (q.tax_value + COALESCE(itemAgg.item_tax_total, 0))::float AS total_tax_value,
      (q.discount + COALESCE(itemAgg.item_discount_total, 0))::float AS total_discount_value

    FROM sales_quotations q

    LEFT JOIN customers c ON c.id = q.customer_id
    LEFT JOIN users creator ON creator.id = q.created_by
    LEFT JOIN users updater ON updater.id = q.updated_by

    LEFT JOIN (
      SELECT
        quotation_id,
        SUM(tax_value) AS item_tax_total,
        SUM(discount) AS item_discount_total
      FROM sales_quotation_items
      GROUP BY quotation_id
    ) itemAgg ON itemAgg.quotation_id = q.id

    LEFT JOIN (
      SELECT
        quotation_id,
        json_agg(
          json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
        ) AS taxes_json
      FROM sales_quotation_taxes
      GROUP BY quotation_id
    ) invoiceTaxAgg ON invoiceTaxAgg.quotation_id = q.id

    ${whereClause}
    ORDER BY q.id DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...whereParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM sales_quotations q ${whereClause}`,
      whereParams,
    );
    const total = Number(totalRows[0].total);

    const quotationsWithParsedTaxes = quotations.map((q) => ({
      ...q,
      taxes: q.taxes_json || [],
    }));

    return {
      data: quotationsWithParsedTaxes,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  // GET ONE SALES QUOTATION
  ipcMain.handle("get-sales-quotation", async (event, id) => {
    const { rows: quotationRows } = await query(
      `SELECT
      q.*,
      q.date::text AS date,
      q.subtotal::float AS subtotal,
      q.discount::float AS discount,
      q.tax_value::float AS tax_value,
      q.net_total::float AS net_total,
      c.name AS customer_name,
      c.phone AS customer_phone,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name
    FROM sales_quotations q
    LEFT JOIN customers c ON c.id = q.customer_id
    LEFT JOIN users creator ON creator.id = q.created_by
    LEFT JOIN users updater ON updater.id = q.updated_by
    WHERE q.id = $1`,
      [id],
    );
    const quotation = quotationRows[0];

    if (!quotation) return null;

    const { rows: items } = await query(
      `SELECT
      qi.*,
      qi.quantity::float AS quantity,
      qi.price::float AS price,
      qi.total::float AS total,
      qi.discount::float AS discount,
      qi.discount_rate::float AS discount_rate,
      qi.tax_rate::float AS tax_rate,
      qi.tax_value::float AS tax_value,
      p.name AS name,
      t.name AS tax_name
    FROM sales_quotation_items qi
    LEFT JOIN products p ON p.id = qi.product_id
    LEFT JOIN taxes t ON t.id = qi.tax_id
    WHERE qi.quotation_id = $1`,
      [id],
    );

    const { rows: taxes } = await query(
      `SELECT id, tax_id, tax_name, tax_rate::float AS tax_rate, tax_value::float AS tax_value
     FROM sales_quotation_taxes
     WHERE quotation_id = $1
     ORDER BY id ASC`,
      [id],
    );

    return {
      ...quotation,
      items,
      taxes,
    };
  });

  ipcMain.handle("delete-sales-quotation", async (event, id) => {
    const { rows: quotationRows } = await query(
      "SELECT * FROM sales_quotations WHERE id = $1",
      [id],
    );
    const quotation = quotationRows[0];

    if (!quotation) {
      return { success: false, error: "SALES_QUOTATION_NOT_FOUND" };
    }
    if (quotation.status === "accepted") {
      return { success: false, error: "CANNOT_DELETE_ACCEPTED_QUOTATION" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      await q(`DELETE FROM sales_quotation_items WHERE quotation_id = $1`, [
        id,
      ]);
      await q(`DELETE FROM sales_quotation_taxes WHERE quotation_id = $1`, [
        id,
      ]);
      await q(`DELETE FROM sales_quotations WHERE id = $1`, [id]);

      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });
}
