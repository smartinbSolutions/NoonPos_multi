// packages/app/src/backend/purchase.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createFundHistory from "../utils/createFundHistory";
import createPayment from "../utils/createPayment";
import createPartyHistory from "../utils/createPaymentHistory";
import createProductMovement from "../utils/createPorductMovment";
import {
  buildDefaultInvoiceName,
  buildDefaultPaymentNote,
} from "../utils/helpers";
import { applyPartyCredit } from "../utils/partyCredit";

export default function registerPurchaseInvoicesIPC() {
  ipcMain.handle("create-purchase-invoice", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (
        !data.supplier_id ||
        !data.date ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        throw new Error("ERROR ENTER DATA");
      }

      const dateOnly = data.date.slice(0, 10);
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      const requestedTaxIds = Array.isArray(data.taxes)
        ? [...new Set(data.taxes.filter(Boolean))]
        : [];

      const invoiceTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) throw new Error("INVALID_TAX_ID");
        invoiceTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const invoiceDiscountRate = Math.min(
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

        if (!item.product_id || enteredQuantity <= 0 || enteredPrice < 0) {
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
          product_id: item.product_id,
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
      const invoiceDiscount = Number(
        ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2),
      );
      const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

      let invoiceTaxValueTotal = 0;
      const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
        const value = Number(
          ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        invoiceTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

      const invoiceTaxRateSum = Number(
        invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal,
        ).toFixed(2),
      );

      const payment = data.payment || null;
      const isPaid = !!payment;
      const isCredit = payment?.source === "credit";

      if (isPaid && !isCredit) {
        if (!payment.fund_id) throw new Error("FUND_REQUIRED");
        if (!payment.amount || Number(payment.amount) <= 0)
          throw new Error("INVALID_PAYMENT_AMOUNT");
      }

      if (
        isPaid &&
        isCredit &&
        (!payment.amount || Number(payment.amount) <= 0)
      ) {
        throw new Error("INVALID_CREDIT_AMOUNT");
      }

      const invoiceResult = await q(
        `INSERT INTO purchase_invoices
         (supplier_id, invoice_name, description, date,
          subtotal, discount, discount_rate, tax_rate, tax_value,
          net_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          data.supplier_id,
          data.invoice_name?.trim() || null,
          data.description?.trim() || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          netTotal,
          data.created_by,
        ],
      );
      const invoiceId = invoiceResult.rows[0].id;

      let invoiceName = data.invoice_name?.trim();
      if (!invoiceName) {
        invoiceName = await buildDefaultInvoiceName(q, "purchase", invoiceId);
        await q(
          `UPDATE purchase_invoices SET invoice_name = $1 WHERE id = $2`,
          [invoiceName, invoiceId],
        );
      }

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO purchase_invoice_taxes (invoice_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [invoiceId, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      for (const item of preparedItems) {
        await q(
          `INSERT INTO purchase_invoice_items
           (invoice_id, product_id, quantity, price, total,
            product_name, product_code, unit_name, unit_conversion_factor,
            tax_id, tax_rate, tax_value, discount, discount_rate, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            invoiceId,
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

        const { rows: productRows } = await q(
          `SELECT p.type AS type, pu.unit_name AS base_unit_name
           FROM products p
           LEFT JOIN product_units pu
             ON pu.product_id = p.id AND pu.is_base = true
           WHERE p.id = $1`,
          [item.product_id],
        );
        const productRow = productRows[0];
        const isService = productRow?.type === "service";

        if (isService) {
          await q(`UPDATE products SET cost_price = $1 WHERE id = $2`, [
            item.basePrice,
            item.product_id,
          ]);
        } else {
          await q(
            `UPDATE products SET quantity = quantity + $1, cost_price = $2 WHERE id = $3`,
            [item.baseQuantity, item.basePrice, item.product_id],
          );
        }

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: invoiceId,
          reference_type: "purchase",
          type: "in",
          action: "create",
          quantity: item.baseQuantity,
          enterPrice: item.basePrice,
          date: fullDateTime,
          base_unit_name: productRow?.base_unit_name || null,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      await createPartyHistory(q, {
        party_type: "supplier",
        party_id: data.supplier_id,
        invoice_id: invoiceId,
        invoice_type: "purchase",
        record_type: "invoice",
        movement_type: "increase",
        amount: netTotal,
        date: fullDateTime,
        note: invoiceName,
      });

      let insertPaymentId = null;
      let creditApplied = null;

      if (isPaid && isCredit) {
        creditApplied = await applyPartyCredit(q, {
          partyId: payment.party_id,
          partyType: payment.party_type,
          invoiceId,
          invoiceType: "purchase",
          amount: payment.amount,
        });
      } else if (isPaid) {
        const paymentNote =
          payment.note ||
          (await buildDefaultPaymentNote(q, "payment", invoiceName));

        insertPaymentId = await createPayment(q, {
          type: payment.type,
          party_type: payment.party_type,
          party_id: payment.party_id,
          fund_id: payment.fund_id,
          amount: payment.amount,
          amount_fund_currency: payment.collected_amount,
          currency_code: payment.currency_code,
          exchange_rate: payment.exchange_rate,
          effective_rate: payment.effective_rate,
          invoice_id: invoiceId,
          invoice_type: payment.mode,
          note: paymentNote,
          date: fullDateTime,
          created_by: data.created_by,
        });

        await createFundHistory(q, {
          fund_id: payment.fund_id,
          record_type: "payment",
          payment_id: insertPaymentId,
          movement_type: "out",
          amount: payment.collected_amount,
          date: fullDateTime,
          note: paymentNote,
        });
      }

      await client.query("COMMIT");
      return {
        success: true,
        invoiceId,
        invoiceName,
        paymentId: insertPaymentId,
        creditApplied,
      };
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

  ipcMain.handle("get-purchase-invoices", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    const havingConditions = [];
    const havingParams = [];
    let paramIndex = 1;

    if (params.dateFrom) {
      whereConditions.push(`p.date::date >= $${paramIndex}::date`);
      whereParams.push(params.dateFrom);
      paramIndex++;
    }
    if (params.dateTo) {
      whereConditions.push(`p.date::date <= $${paramIndex}::date`);
      whereParams.push(params.dateTo);
      paramIndex++;
    }
    if (params.supplierId) {
      whereConditions.push(`p.supplier_id = $${paramIndex}`);
      whereParams.push(params.supplierId);
      paramIndex++;
    }
    if (
      params.minTotal !== undefined &&
      params.minTotal !== "" &&
      params.minTotal !== null
    ) {
      whereConditions.push(`p.net_total >= $${paramIndex}`);
      whereParams.push(Number(params.minTotal));
      paramIndex++;
    }
    if (
      params.maxTotal !== undefined &&
      params.maxTotal !== "" &&
      params.maxTotal !== null
    ) {
      whereConditions.push(`p.net_total <= $${paramIndex}`);
      whereParams.push(Number(params.maxTotal));
      paramIndex++;
    }

    if (Array.isArray(params.taxIds) && params.taxIds.length) {
      const taxPlaceholders = params.taxIds
        .map(() => `$${paramIndex++}`)
        .join(",");
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM purchase_invoice_taxes pit
          WHERE pit.invoice_id = p.id AND pit.tax_id IN (${taxPlaceholders})
        )
      `);
      whereParams.push(...params.taxIds);
    }

    if (params.status) {
      havingConditions.push(`
        CASE
          WHEN COALESCE(SUM(pa.amount), 0) >= p.net_total THEN 'paid'
          WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END = $${paramIndex}
      `);
      havingParams.push(params.status);
      paramIndex++;
    }

    if (params.returnStatus) {
      havingConditions.push(`
        CASE
          WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
          WHEN ret.total_returned >= ret.total_quantity THEN 'full'
          ELSE 'partial'
        END = $${paramIndex}
      `);
      havingParams.push(params.returnStatus);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";
    const havingClause = havingConditions.length
      ? `HAVING ${havingConditions.join(" AND ")}`
      : "";

    const { rows: invoices } = await query(
      `SELECT
        p.*,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        creator.full_name AS created_by_name,
        updater.full_name AS updated_by_name,
        invoiceTaxAgg.taxes_json,
        COALESCE(SUM(pa.amount), 0) AS paid_amount,

        COALESCE(itemAgg.item_tax_total, 0) AS item_tax_total,
        COALESCE(itemAgg.item_discount_total, 0) AS item_discount_total,
        (p.tax_value + COALESCE(itemAgg.item_tax_total, 0)) AS total_tax_value,
        (p.discount + COALESCE(itemAgg.item_discount_total, 0)) AS total_discount_value,

        p.net_total - COALESCE(SUM(pa.amount), 0) AS remaining_amount,

        CASE
          WHEN COALESCE(SUM(pa.amount), 0) >= p.net_total THEN 'paid'
          WHEN COALESCE(SUM(pa.amount), 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END AS status,

        CASE
          WHEN COALESCE(ret.total_returned, 0) <= 0 THEN 'none'
          WHEN ret.total_returned >= ret.total_quantity THEN 'full'
          ELSE 'partial'
        END AS return_status

      FROM purchase_invoices p

      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN payment_allocations pa
        ON pa.invoice_id = p.id AND pa.invoice_type = 'purchase'
      LEFT JOIN users creator ON creator.id = p.created_by
      LEFT JOIN users updater ON updater.id = p.updated_by

      LEFT JOIN (
        SELECT
          invoice_id,
          SUM(tax_value) AS item_tax_total,
          SUM(discount) AS item_discount_total
        FROM purchase_invoice_items
        GROUP BY invoice_id
      ) itemAgg ON itemAgg.invoice_id = p.id

      LEFT JOIN (
        SELECT
          invoice_id,
          json_agg(
            json_build_object('tax_id', tax_id, 'name', tax_name, 'rate', tax_rate, 'value', tax_value)
          ) AS taxes_json
        FROM purchase_invoice_taxes
        GROUP BY invoice_id
      ) invoiceTaxAgg ON invoiceTaxAgg.invoice_id = p.id

      LEFT JOIN (
        SELECT
          pi.invoice_id,
          SUM(pi.quantity) AS total_quantity,
          SUM(COALESCE(pri.returned_qty, 0)) AS total_returned
        FROM purchase_invoice_items pi
        LEFT JOIN (
          SELECT purchase_invoice_item_id, SUM(quantity) AS returned_qty
          FROM purchase_return_items
          GROUP BY purchase_invoice_item_id
        ) pri ON pri.purchase_invoice_item_id = pi.id
        GROUP BY pi.invoice_id
      ) ret ON ret.invoice_id = p.id

      ${whereClause}
      GROUP BY p.id, s.name, s.phone, creator.full_name, updater.full_name,
               invoiceTaxAgg.taxes_json, itemAgg.item_tax_total, itemAgg.item_discount_total,
               ret.total_returned, ret.total_quantity
      ${havingClause}

      ORDER BY p.id DESC

      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...whereParams, ...havingParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM (
        SELECT p.id
        FROM purchase_invoices p
        LEFT JOIN payment_allocations pa
          ON pa.invoice_id = p.id AND pa.invoice_type = 'purchase'
        LEFT JOIN (
          SELECT
            pi.invoice_id,
            SUM(pi.quantity) AS total_quantity,
            SUM(COALESCE(pri.returned_qty, 0)) AS total_returned
          FROM purchase_invoice_items pi
          LEFT JOIN (
            SELECT purchase_invoice_item_id, SUM(quantity) AS returned_qty
            FROM purchase_return_items
            GROUP BY purchase_invoice_item_id
          ) pri ON pri.purchase_invoice_item_id = pi.id
          GROUP BY pi.invoice_id
        ) ret ON ret.invoice_id = p.id
        ${whereClause}
        GROUP BY p.id, ret.total_returned, ret.total_quantity
        ${havingClause}
      ) t`,
      [...whereParams, ...havingParams],
    );
    const total = Number(totalRows[0].total);

    const invoicesWithParsedTaxes = invoices.map((inv) => ({
      ...inv,
      taxes: inv.taxes_json || [],
    }));

    return {
      data: invoicesWithParsedTaxes,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-purchase-invoice", async (event, id) => {
    const { rows: invoiceRows } = await query(
      `SELECT
        pi.*,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        creator.full_name AS created_by_name,
        updater.full_name AS updated_by_name,
        COALESCE(pa_sum.paid_amount, 0) AS paid_amount,
        pi.net_total - COALESCE(pa_sum.paid_amount, 0) AS remaining_amount,

        CASE
          WHEN COALESCE(pa_sum.paid_amount, 0) >= pi.net_total THEN 'paid'
          WHEN COALESCE(pa_sum.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END AS status

      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      LEFT JOIN users creator ON creator.id = pi.created_by
      LEFT JOIN users updater ON updater.id = pi.updated_by
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS paid_amount
        FROM payment_allocations
        WHERE invoice_type = 'purchase'
        GROUP BY invoice_id
      ) pa_sum ON pa_sum.invoice_id = pi.id
      WHERE pi.id = $1`,
      [id],
    );
    const invoice = invoiceRows[0];

    if (!invoice) return null;

    const { rows: items } = await query(
      `SELECT
        pii.*,
        p.name AS name,
        t.name AS tax_name,

        COALESCE(r.returned_quantity, 0) AS returned_quantity,
        (pii.quantity - COALESCE(r.returned_quantity, 0)) AS available_quantity

      FROM purchase_invoice_items pii
      LEFT JOIN products p ON p.id = pii.product_id
      LEFT JOIN taxes t ON t.id = pii.tax_id
      LEFT JOIN (
        SELECT
          pri.purchase_invoice_item_id,
          SUM(pri.quantity) AS returned_quantity
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        GROUP BY pri.purchase_invoice_item_id
      ) r ON r.purchase_invoice_item_id = pii.id

      WHERE pii.invoice_id = $1`,
      [id],
    );

    const { rows: taxes } = await query(
      `SELECT id, tax_id, tax_name, tax_rate, tax_value
       FROM purchase_invoice_taxes
       WHERE invoice_id = $1
       ORDER BY id ASC`,
      [id],
    );

    const { rows: allocations } = await query(
      `SELECT
        pa.id,
        pa.payment_id,
        pa.amount,
        p.date,
        p.fund_id,
        p.note,
        p.currency_code,
        p.exchange_rate,
        p.effective_rate,
        p.amount_fund_currency,
        f.name AS fund_name,
        c.code AS fund_currency_code,
        c.symbol AS fund_currency_symbol
      FROM payment_allocations pa
      LEFT JOIN payments p ON p.id = pa.payment_id
      LEFT JOIN funds f ON f.id = p.fund_id
      LEFT JOIN currencies c ON c.id = f.currency_id
      WHERE pa.invoice_id = $1
        AND pa.invoice_type = 'purchase'
      ORDER BY pa.id ASC`,
      [id],
    );

    return { ...invoice, items, taxes, allocations };
  });

  ipcMain.handle("update-purchase-invoice", async (event, data) => {
    if (
      !data.id ||
      !data.supplier_id ||
      !data.date ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const { rows: oldInvoiceRows } = await query(
      "SELECT * FROM purchase_invoices WHERE id = $1",
      [data.id],
    );
    const oldInvoice = oldInvoiceRows[0];

    if (!oldInvoice) {
      return { success: false, error: "Invoice not found" };
    }

    const { rows: hasReturnRows } = await query(
      `SELECT 1
       FROM purchase_return_items pri
       JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
       WHERE pii.invoice_id = $1
       LIMIT 1`,
      [data.id],
    );

    if (hasReturnRows[0]) {
      return { success: false, error: "CANNOT_MODIFY_INVOICE_WITH_RETURN" };
    }

    const oldSupplierId = oldInvoice.supplier_id || null;
    const newSupplierId = data.supplier_id || null;

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

      const invoiceTaxes = [];
      for (const taxId of requestedTaxIds) {
        const { rows } = await q(
          `SELECT id, name, rate FROM taxes WHERE id = $1 AND category IN ('invoice', 'both')`,
          [taxId],
        );
        const taxRow = rows[0];
        if (!taxRow) throw new Error("INVALID_TAX_ID");
        invoiceTaxes.push({
          tax_id: taxRow.id,
          tax_name: taxRow.name,
          tax_rate: Number(taxRow.rate || 0),
        });
      }

      const invoiceDiscountRate = Math.min(
        100,
        Math.max(0, Number(data.discount_rate || 0)),
      );

      const preparedItems = [];
      let subtotal = 0;
      let itemDiscountTotal = 0;
      let itemTaxTotal = 0;

      for (const item of data.items) {
        if (!item.product_id) continue;

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
          product_id: item.product_id,
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
      const invoiceDiscount = Number(
        ((afterItemDiscounts * invoiceDiscountRate) / 100).toFixed(2),
      );
      const afterInvoiceDiscount = afterItemDiscounts - invoiceDiscount;

      let invoiceTaxValueTotal = 0;
      const preparedInvoiceTaxes = invoiceTaxes.map((tax) => {
        const value = Number(
          ((afterInvoiceDiscount * tax.tax_rate) / 100).toFixed(2),
        );
        invoiceTaxValueTotal += value;
        return { ...tax, tax_value: value };
      });
      invoiceTaxValueTotal = Number(invoiceTaxValueTotal.toFixed(2));

      const invoiceTaxRateSum = Number(
        invoiceTaxes.reduce((sum, t) => sum + t.tax_rate, 0).toFixed(2),
      );

      const netTotal = Number(
        Math.max(
          0,
          afterInvoiceDiscount + itemTaxTotal + invoiceTaxValueTotal,
        ).toFixed(2),
      );

      const { rows: oldItems } = await q(
        "SELECT * FROM purchase_invoice_items WHERE invoice_id = $1",
        [data.id],
      );

      const oldByProduct = new Map();
      for (const item of oldItems) {
        const cur = oldByProduct.get(item.product_id) || {
          quantity: 0,
          price: item.price,
        };
        oldByProduct.set(item.product_id, {
          quantity: cur.quantity + Number(item.quantity || 0),
          price: item.price,
        });
      }

      const newByProduct = new Map();
      for (const item of preparedItems) {
        const cur = newByProduct.get(item.product_id) || {
          quantity: 0,
          price: item.basePrice,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        };
        newByProduct.set(item.product_id, {
          quantity: cur.quantity + item.baseQuantity,
          price: item.basePrice,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      const involvedProductIds = [
        ...new Set([...oldByProduct.keys(), ...newByProduct.keys()]),
      ];
      const productInfoById = new Map();
      if (involvedProductIds.length) {
        const placeholders = involvedProductIds
          .map((_, i) => `$${i + 1}`)
          .join(",");
        const { rows } = await q(
          `SELECT p.id, p.type, pu.unit_name AS base_unit_name
           FROM products p
           LEFT JOIN product_units pu
             ON pu.product_id = p.id AND pu.is_base = true
           WHERE p.id IN (${placeholders})`,
          involvedProductIds,
        );
        for (const row of rows) {
          productInfoById.set(row.id, row);
        }
      }

      for (const [productId, old] of oldByProduct) {
        if (!newByProduct.has(productId)) {
          const isService = productInfoById.get(productId)?.type === "service";
          if (!isService) {
            await q(
              `UPDATE products SET quantity = quantity + $1 WHERE id = $2`,
              [-old.quantity, productId],
            );
          }
          await q(
            `DELETE FROM product_movements
             WHERE reference_type = 'purchase' AND reference_id = $1 AND product_id = $2`,
            [data.id, productId],
          );
        }
      }

      for (const [productId, next] of newByProduct) {
        const old = oldByProduct.get(productId);
        const oldQty = old ? old.quantity : 0;
        const delta = next.quantity - oldQty;
        const info = productInfoById.get(productId);
        const isService = info?.type === "service";

        if (delta !== 0 && !isService) {
          await q(
            `UPDATE products SET quantity = quantity + $1 WHERE id = $2`,
            [delta, productId],
          );
        }

        await q(`UPDATE products SET cost_price = $1 WHERE id = $2`, [
          next.price,
          productId,
        ]);

        if (old) {
          await q(
            `UPDATE product_movements
             SET quantity = $1, enter_price = $2, action = 'update', date = $3,
                 base_unit_name = $4, unit_name = $5, conversion_factor = $6
             WHERE reference_type = 'purchase' AND reference_id = $7 AND product_id = $8`,
            [
              next.quantity,
              next.price,
              fullDateTime,
              info?.base_unit_name || null,
              next.unit_name,
              next.conversion_factor,
              data.id,
              productId,
            ],
          );
        } else {
          await createProductMovement(q, {
            product_id: productId,
            reference_id: data.id,
            reference_type: "purchase",
            action: "create",
            type: "in",
            quantity: next.quantity,
            enterPrice: next.price,
            date: fullDateTime,
            base_unit_name: info?.base_unit_name || null,
            unit_name: next.unit_name,
            conversion_factor: next.conversion_factor,
          });
        }
      }

      await q(`DELETE FROM purchase_invoice_taxes WHERE invoice_id = $1`, [
        data.id,
      ]);

      for (const tax of preparedInvoiceTaxes) {
        await q(
          `INSERT INTO purchase_invoice_taxes (invoice_id, tax_id, tax_name, tax_rate, tax_value)
           VALUES ($1,$2,$3,$4,$5)`,
          [data.id, tax.tax_id, tax.tax_name, tax.tax_rate, tax.tax_value],
        );
      }

      await q(`DELETE FROM purchase_invoice_items WHERE invoice_id = $1`, [
        data.id,
      ]);

      for (const item of preparedItems) {
        await q(
          `INSERT INTO purchase_invoice_items
           (invoice_id, product_id, quantity, price, total,
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

      const invoiceName = data.invoice_name?.trim() || oldInvoice.invoice_name;

      await q(
        `UPDATE purchase_invoices
         SET supplier_id = $1, invoice_name = $2, description = $3, date = $4,
             subtotal = $5, discount = $6, discount_rate = $7,
             tax_rate = $8, tax_value = $9, net_total = $10, updated_by = $11
         WHERE id = $12`,
        [
          newSupplierId,
          invoiceName,
          data.description?.trim() || null,
          fullDateTime,
          subtotal,
          invoiceDiscount,
          invoiceDiscountRate,
          invoiceTaxRateSum,
          invoiceTaxValueTotal,
          netTotal,
          data.updated_by,
          data.id,
        ],
      );

      if (oldSupplierId && oldSupplierId === newSupplierId) {
        await q(
          `UPDATE party_history
           SET amount = $1, date = $2, note = $3
           WHERE invoice_id = $4 AND invoice_type = 'purchase' AND record_type = 'invoice'`,
          [netTotal, fullDateTime, invoiceName, data.id],
        );
      } else {
        if (oldSupplierId) {
          await q(
            `DELETE FROM party_history
             WHERE invoice_id = $1 AND invoice_type = 'purchase' AND record_type = 'invoice'`,
            [data.id],
          );
        }

        if (newSupplierId) {
          await createPartyHistory(q, {
            party_type: "supplier",
            party_id: newSupplierId,
            invoice_id: data.id,
            invoice_type: "purchase",
            record_type: "invoice",
            movement_type: "increase",
            amount: netTotal,
            date: fullDateTime,
            note: invoiceName,
          });
        }
      }

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

  ipcMain.handle("delete-purchase-invoice", async (event, id) => {
    const { rows: invoiceRows } = await query(
      "SELECT * FROM purchase_invoices WHERE id = $1",
      [id],
    );
    if (!invoiceRows[0]) {
      return { success: false, error: "PURCHASE INVOICE NOT FOUND" };
    }

    const { rows: hasReturnRows } = await query(
      `SELECT 1
       FROM purchase_return_items pri
       JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
       WHERE pii.invoice_id = $1
       LIMIT 1`,
      [id],
    );
    if (hasReturnRows[0]) {
      return { success: false, error: "CANNOT_DELETE_INVOICE_WITH_RETURN" };
    }

    const { rows: hasPaymentRows } = await query(
      `SELECT 1 FROM payment_allocations
       WHERE invoice_id = $1 AND invoice_type = 'purchase'
       LIMIT 1`,
      [id],
    );
    if (hasPaymentRows[0]) {
      return { success: false, error: "CANNOT_DELETE_PAID_INVOICE" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const { rows: items } = await q(
        "SELECT * FROM purchase_invoice_items WHERE invoice_id = $1",
        [id],
      );

      const now = new Date();
      const date =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0");

      for (const item of items) {
        await q(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [
          item.quantity || 0,
          item.product_id,
        ]);

        await createProductMovement(q, {
          product_id: item.product_id,
          reference_id: id,
          reference_type: "purchase",
          action: "delete",
          type: "out",
          quantity: item.quantity,
          enterPrice: item.price,
          date: date,
        });
      }

      await q("DELETE FROM purchase_invoice_items WHERE invoice_id = $1", [id]);
      await q(
        `DELETE FROM party_history WHERE invoice_id = $1 AND invoice_type = 'purchase'`,
        [id],
      );
      await q("DELETE FROM purchase_invoices WHERE id = $1", [id]);

      await client.query("COMMIT");
      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message };
    } finally {
      client.release();
    }
  });
}
