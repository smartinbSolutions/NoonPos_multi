// packages/app/src/backend/manufacturing.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";
import createProductMovement from "../utils/createPorductMovment";
import { buildDefaultInvoiceName } from "../utils/helpers";

async function assertProductIsPhysical(q, productId, errorCode) {
  const { rows } = await q(`SELECT id, type FROM products WHERE id = $1`, [
    productId,
  ]);
  const product = rows[0];

  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
  if (product.type === "service") {
    throw new Error(errorCode);
  }

  return product;
}

export default function registerManufacturingOrdersIPC() {
  // CREATE
  ipcMain.handle("create-manufacturing-order", async (event, data) => {
    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      if (
        !data.output_product_id ||
        !data.output_quantity ||
        Number(data.output_quantity) <= 0 ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        throw new Error("ERROR ENTER DATA");
      }

      const dateOnly = (data.date || new Date().toISOString()).slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      await assertProductIsPhysical(
        q,
        data.output_product_id,
        "SERVICE_PRODUCTS_CANNOT_BE_MANUFACTURED",
      );

      const outputFactor = Number(data.output_unit_conversion_factor || 1);
      const outputQuantity = Number(data.output_quantity);
      const outputBaseQuantity = outputQuantity * outputFactor;

      // ---- Raw material lines — recomputed from raw inputs only ----
      const seen = new Set();
      const preparedItems = [];
      let rawMaterialCost = 0;

      for (const item of data.items) {
        if (
          !item.raw_material_product_id ||
          !item.quantity ||
          Number(item.quantity) <= 0
        ) {
          throw new Error("INVALID_MANUFACTURING_ITEM");
        }
        if (
          Number(item.raw_material_product_id) ===
          Number(data.output_product_id)
        ) {
          throw new Error("RAW_MATERIAL_CANNOT_BE_OUTPUT_PRODUCT");
        }
        if (seen.has(item.raw_material_product_id)) {
          throw new Error("DUPLICATE_RAW_MATERIAL_IN_ORDER");
        }
        seen.add(item.raw_material_product_id);

        const { rows: rawProductRows } = await q(
          `SELECT id, type, quantity, cost_price FROM products WHERE id = $1`,
          [item.raw_material_product_id],
        );
        const rawProduct = rawProductRows[0];

        if (!rawProduct) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (rawProduct.type === "service") {
          throw new Error("SERVICE_PRODUCTS_CANNOT_BE_RAW_MATERIALS");
        }

        const factor = Number(item.unit_conversion_factor || 1);
        const quantity = Number(item.quantity);
        const baseQuantity = quantity * factor;

        // Hard stock check — manufacturing can never consume more than
        // what's physically on hand, regardless of allow_negative_stock
        // (that setting governs selling to customers, not production input).
        if (Number(rawProduct.quantity) < baseQuantity) {
          throw new Error("INSUFFICIENT_RAW_MATERIAL_STOCK");
        }

        const unitCostSnapshot = Number(rawProduct.cost_price || 0);
        const lineCost = Number((baseQuantity * unitCostSnapshot).toFixed(2));

        rawMaterialCost += lineCost;

        preparedItems.push({
          raw_material_product_id: item.raw_material_product_id,
          quantity,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          unitCostSnapshot,
          lineCost,
        });
      }

      rawMaterialCost = Number(rawMaterialCost.toFixed(2));
      const laborCost = Number(data.labor_cost || 0);
      const overheadCost = Number(data.overhead_cost || 0);
      const totalCost = Number(
        (rawMaterialCost + laborCost + overheadCost).toFixed(2),
      );
      const unitCost = Number(
        (outputBaseQuantity > 0 ? totalCost / outputBaseQuantity : 0).toFixed(
          2,
        ),
      );

      // ---- Insert header ----
      const { rows: orderRows } = await q(
        `INSERT INTO manufacturing_orders
         (
           order_name, bom_id, output_product_id,
           output_quantity, output_unit_name, output_unit_conversion_factor,
           labor_cost, overhead_cost, raw_material_cost, total_cost, unit_cost,
           date, description, created_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          data.order_name?.trim() || null,
          data.bom_id || null,
          data.output_product_id,
          outputQuantity,
          data.output_unit_name || null,
          outputFactor,
          laborCost,
          overheadCost,
          rawMaterialCost,
          totalCost,
          unitCost,
          fullDateTime,
          data.description?.trim() || null,
          data.created_by,
        ],
      );
      const orderId = orderRows[0].id;

      let orderName = data.order_name?.trim();
      if (!orderName) {
        orderName = await buildDefaultInvoiceName(q, "manufacturing", orderId);
        await q(
          `UPDATE manufacturing_orders SET order_name = $1 WHERE id = $2`,
          [orderName, orderId],
        );
      }

      // ---- Insert raw material lines + stock OUT + movements ----
      for (const item of preparedItems) {
        await q(
          `INSERT INTO manufacturing_order_items
           (manufacturing_order_id, raw_material_product_id, quantity, unit_name,
            unit_conversion_factor, unit_cost_snapshot, line_cost)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            orderId,
            item.raw_material_product_id,
            item.quantity,
            item.unit_name,
            item.unit_conversion_factor,
            item.unitCostSnapshot,
            item.lineCost,
          ],
        );

        const { rows: rawUnitRows } = await q(
          `SELECT pu.unit_name AS base_unit_name
           FROM product_units pu
           WHERE pu.product_id = $1 AND pu.is_base = true`,
          [item.raw_material_product_id],
        );
        const rawUnitInfo = rawUnitRows[0];

        await q(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [
          item.baseQuantity,
          item.raw_material_product_id,
        ]);

        await createProductMovement(q, {
          product_id: item.raw_material_product_id,
          reference_id: orderId,
          reference_type: "manufacturing",
          type: "out",
          action: "create",
          quantity: item.baseQuantity,
          outPrice: item.unitCostSnapshot,
          date: fullDateTime,
          base_unit_name: rawUnitInfo?.base_unit_name || null,
          unit_name: item.unit_name,
          conversion_factor: item.unit_conversion_factor,
        });
      }

      // ---- Output product: stock IN + cost_price overwrite + movement ----
      const { rows: outputUnitRows } = await q(
        `SELECT pu.unit_name AS base_unit_name
         FROM product_units pu
         WHERE pu.product_id = $1 AND pu.is_base = true`,
        [data.output_product_id],
      );
      const outputUnitInfo = outputUnitRows[0];

      await q(
        `UPDATE products SET quantity = quantity + $1, cost_price = $2 WHERE id = $3`,
        [outputBaseQuantity, unitCost, data.output_product_id],
      );

      await createProductMovement(q, {
        product_id: data.output_product_id,
        reference_id: orderId,
        reference_type: "manufacturing",
        type: "in",
        action: "create",
        quantity: outputBaseQuantity,
        enterPrice: unitCost,
        date: fullDateTime,
        base_unit_name: outputUnitInfo?.base_unit_name || null,
        unit_name: data.output_unit_name || null,
        conversion_factor: outputFactor,
      });

      await client.query("COMMIT");
      return { success: true, orderId, orderName };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  // GET LIST
  ipcMain.handle("get-manufacturing-orders", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const whereConditions = [];
    const whereParams = [];
    let paramIndex = 1;

    if (params.search) {
      whereConditions.push(`mo.order_name ILIKE $${paramIndex}`);
      whereParams.push(`%${params.search.trim()}%`);
      paramIndex++;
    }
    if (params.output_product_id) {
      whereConditions.push(`mo.output_product_id = $${paramIndex}`);
      whereParams.push(params.output_product_id);
      paramIndex++;
    }
    if (params.unit_id) {
      whereConditions.push(`p.unit_id = $${paramIndex}`);
      whereParams.push(params.unit_id);
      paramIndex++;
    }
    if (params.dateFrom) {
      whereConditions.push(`mo.date::date >= $${paramIndex}::date`);
      whereParams.push(params.dateFrom);
      paramIndex++;
    }
    if (params.dateTo) {
      whereConditions.push(`mo.date::date <= $${paramIndex}::date`);
      whereParams.push(params.dateTo);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    try {
      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total
         FROM manufacturing_orders mo
         JOIN products p ON p.id = mo.output_product_id
         ${whereClause}`,
        whereParams,
      );
      const total = Number(totalRows[0].total);

      const { rows: orders } = await query(
        `SELECT
           mo.*,
           mo.date::text AS date,
           mo.output_quantity::float AS output_quantity,
           mo.output_unit_conversion_factor::float AS output_unit_conversion_factor,
           mo.labor_cost::float AS labor_cost,
           mo.overhead_cost::float AS overhead_cost,
           mo.raw_material_cost::float AS raw_material_cost,
           mo.total_cost::float AS total_cost,
           mo.unit_cost::float AS unit_cost,
           mo.created_at::text AS created_at,
           mo.updated_at::text AS updated_at,
           p.name AS output_product_name,
           p.code AS output_product_code,
           creator.full_name AS created_by_name,
           updater.full_name AS updated_by_name,
           (
             SELECT COUNT(*) FROM manufacturing_order_items moi
             WHERE moi.manufacturing_order_id = mo.id
           )::int AS item_count
         FROM manufacturing_orders mo
         JOIN products p ON p.id = mo.output_product_id
         LEFT JOIN users creator ON creator.id = mo.created_by
         LEFT JOIN users updater ON updater.id = mo.updated_by
         ${whereClause}
         ORDER BY mo.id DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...whereParams, limit, offset],
      );

      return {
        success: true,
        data: orders,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // GET ONE
  ipcMain.handle("get-manufacturing-order", async (event, id) => {
    if (!id) {
      return { success: false, error: "MISSING_MANUFACTURING_ORDER_ID" };
    }

    try {
      const { rows: orderRows } = await query(
        `SELECT
           mo.*,
           mo.date::text AS date,
           mo.output_quantity::float AS output_quantity,
           mo.output_unit_conversion_factor::float AS output_unit_conversion_factor,
           mo.labor_cost::float AS labor_cost,
           mo.overhead_cost::float AS overhead_cost,
           mo.raw_material_cost::float AS raw_material_cost,
           mo.total_cost::float AS total_cost,
           mo.unit_cost::float AS unit_cost,
           mo.created_at::text AS created_at,
           mo.updated_at::text AS updated_at,
           p.name AS output_product_name,
           p.code AS output_product_code
         FROM manufacturing_orders mo
         JOIN products p ON p.id = mo.output_product_id
         WHERE mo.id = $1`,
        [id],
      );
      const order = orderRows[0];

      if (!order) {
        return { success: false, error: "MANUFACTURING_ORDER_NOT_FOUND" };
      }

      const { rows: items } = await query(
        `SELECT
           moi.*,
           moi.quantity::float AS quantity,
           moi.unit_conversion_factor::float AS unit_conversion_factor,
           moi.unit_cost_snapshot::float AS unit_cost_snapshot,
           moi.line_cost::float AS line_cost,
           p.name AS raw_material_name,
           p.code AS raw_material_code
         FROM manufacturing_order_items moi
         JOIN products p ON p.id = moi.raw_material_product_id
         WHERE moi.manufacturing_order_id = $1
         ORDER BY moi.id ASC`,
        [id],
      );

      // Batch-fetch each raw material's full unit list, same pattern as
      // get-bom — lets the edit form's unit dropdown populate immediately.
      if (items.length > 0) {
        const productIds = [
          ...new Set(items.map((i) => i.raw_material_product_id)),
        ];
        const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");

        const { rows: allUnits } = await query(
          `SELECT id, product_id, unit_name,
             conversion_factor::float AS conversion_factor,
             is_base, sale_price::float AS sale_price, barcode
           FROM product_units
           WHERE product_id IN (${placeholders})`,
          productIds,
        );

        const unitsByProduct = new Map();
        for (const u of allUnits) {
          if (!unitsByProduct.has(u.product_id)) {
            unitsByProduct.set(u.product_id, []);
          }
          unitsByProduct.get(u.product_id).push(u);
        }

        for (const item of items) {
          item.available_units =
            unitsByProduct.get(item.raw_material_product_id) || [];
        }
      }

      // Same for the output product itself, since its unit may also need
      // to be switchable on edit.
      const { rows: outputUnits } = await query(
        `SELECT id, product_id, unit_name,
           conversion_factor::float AS conversion_factor,
           is_base, sale_price::float AS sale_price, barcode
         FROM product_units
         WHERE product_id = $1`,
        [order.output_product_id],
      );

      return {
        success: true,
        data: { ...order, items, output_available_units: outputUnits },
      };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // UPDATE
  ipcMain.handle("update-manufacturing-order", async (event, data) => {
    if (
      !data.id ||
      !data.output_product_id ||
      !data.output_quantity ||
      Number(data.output_quantity) <= 0 ||
      !Array.isArray(data.items) ||
      data.items.length === 0
    ) {
      return { success: false, error: "ERROR ENTER DATA" };
    }

    const { rows: oldOrderRows } = await query(
      `SELECT * FROM manufacturing_orders WHERE id = $1`,
      [data.id],
    );
    const oldOrder = oldOrderRows[0];

    if (!oldOrder) {
      return { success: false, error: "MANUFACTURING_ORDER_NOT_FOUND" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const dateOnly = (data.date || new Date().toISOString()).slice(0, 10);
      const time = new Date().toTimeString().slice(0, 8);
      const fullDateTime = `${dateOnly} ${time}`;

      await assertProductIsPhysical(
        q,
        data.output_product_id,
        "SERVICE_PRODUCTS_CANNOT_BE_MANUFACTURED",
      );

      const outputFactor = Number(data.output_unit_conversion_factor || 1);
      const outputQuantity = Number(data.output_quantity);
      const outputBaseQuantity = outputQuantity * outputFactor;

      // ---- Guard: output product can't change on edit — reversing/reapplying
      // against a different product entirely is a "create new order" case ----
      if (
        Number(data.output_product_id) !== Number(oldOrder.output_product_id)
      ) {
        throw new Error("CANNOT_CHANGE_OUTPUT_PRODUCT_ON_EDIT");
      }

      // ---- Guard: if reducing output quantity, enough must still be in stock
      // to reverse the difference (some may have already been sold/consumed) ----
      const oldOutputBaseQuantity =
        Number(oldOrder.output_quantity) *
        Number(oldOrder.output_unit_conversion_factor || 1);
      const outputDelta = outputBaseQuantity - oldOutputBaseQuantity;

      if (outputDelta < 0) {
        const { rows: outputProductRows } = await q(
          `SELECT quantity FROM products WHERE id = $1`,
          [data.output_product_id],
        );
        const outputProduct = outputProductRows[0];
        if (Number(outputProduct.quantity) < Math.abs(outputDelta)) {
          throw new Error("CANNOT_REVERSE_STOCK_ALREADY_CONSUMED");
        }
      }

      // ---- Recompute raw material lines from raw inputs only ----
      const seen = new Set();
      const preparedItems = [];

      for (const item of data.items) {
        if (
          !item.raw_material_product_id ||
          !item.quantity ||
          Number(item.quantity) <= 0
        ) {
          throw new Error("INVALID_MANUFACTURING_ITEM");
        }
        if (
          Number(item.raw_material_product_id) ===
          Number(data.output_product_id)
        ) {
          throw new Error("RAW_MATERIAL_CANNOT_BE_OUTPUT_PRODUCT");
        }
        if (seen.has(item.raw_material_product_id)) {
          throw new Error("DUPLICATE_RAW_MATERIAL_IN_ORDER");
        }
        seen.add(item.raw_material_product_id);

        const { rows: rawProductRows } = await q(
          `SELECT id, type, quantity, cost_price FROM products WHERE id = $1`,
          [item.raw_material_product_id],
        );
        const rawProduct = rawProductRows[0];

        if (!rawProduct) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (rawProduct.type === "service") {
          throw new Error("SERVICE_PRODUCTS_CANNOT_BE_RAW_MATERIALS");
        }

        const factor = Number(item.unit_conversion_factor || 1);
        const quantity = Number(item.quantity);
        const baseQuantity = quantity * factor;

        preparedItems.push({
          raw_material_product_id: item.raw_material_product_id,
          quantity,
          unit_name: item.unit_name || null,
          unit_conversion_factor: factor,
          baseQuantity,
          currentStock: Number(rawProduct.quantity),
          costPrice: Number(rawProduct.cost_price || 0),
        });
      }

      // ---- Diff old vs new raw material lines by product ----
      const { rows: oldItems } = await q(
        `SELECT * FROM manufacturing_order_items WHERE manufacturing_order_id = $1`,
        [data.id],
      );

      const oldByProduct = new Map();
      for (const item of oldItems) {
        oldByProduct.set(item.raw_material_product_id, item);
      }

      const newByProduct = new Map();
      for (const item of preparedItems) {
        newByProduct.set(item.raw_material_product_id, item);
      }

      // For lines being removed entirely: raw material was consumed
      // (subtracted) originally, so removing the line means adding it
      // BACK — never needs a stock-sufficiency check (adding can't go
      // negative).
      // For lines with an increased quantity: additional stock must be
      // consumed now — check sufficiency.
      // For lines with a decreased quantity: some was already reversed
      // effectively (less will be consumed) — always safe.
      for (const [productId, newItem] of newByProduct) {
        const oldItem = oldByProduct.get(productId);
        const oldBaseQty = oldItem
          ? Number(oldItem.quantity) *
            Number(oldItem.unit_conversion_factor || 1)
          : 0;
        const delta = newItem.baseQuantity - oldBaseQty;

        if (delta > 0 && newItem.currentStock < delta) {
          throw new Error("INSUFFICIENT_RAW_MATERIAL_STOCK");
        }
      }

      // Lines removed entirely — add stock back, delete movement
      for (const [productId, oldItem] of oldByProduct) {
        if (!newByProduct.has(productId)) {
          const oldBaseQty =
            Number(oldItem.quantity) *
            Number(oldItem.unit_conversion_factor || 1);

          // negative delta passed to the "subtract" update = add back
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [-oldBaseQty, productId],
          );

          await q(
            `DELETE FROM product_movements
             WHERE reference_type = 'manufacturing' AND reference_id = $1 AND product_id = $2 AND type = 'out'`,
            [data.id, productId],
          );
        }
      }

      // Lines present in new set — apply delta (positive delta = consume more)
      let rawMaterialCostTotal = 0;
      for (const [productId, newItem] of newByProduct) {
        const oldItem = oldByProduct.get(productId);
        const oldBaseQty = oldItem
          ? Number(oldItem.quantity) *
            Number(oldItem.unit_conversion_factor || 1)
          : 0;
        const delta = newItem.baseQuantity - oldBaseQty;

        if (delta !== 0) {
          await q(
            `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
            [delta, productId],
          );
        }

        const lineCost = Number(
          (newItem.baseQuantity * newItem.costPrice).toFixed(2),
        );
        rawMaterialCostTotal += lineCost;
        newItem.lineCost = lineCost;
        newItem.unitCostSnapshot = newItem.costPrice;

        if (oldItem) {
          await q(
            `UPDATE product_movements
             SET quantity = $1, out_price = $2, action = 'update', date = $3,
                 unit_name = $4, conversion_factor = $5
             WHERE reference_type = 'manufacturing' AND reference_id = $6 AND product_id = $7 AND type = 'out'`,
            [
              newItem.baseQuantity,
              newItem.costPrice,
              fullDateTime,
              newItem.unit_name,
              newItem.unit_conversion_factor,
              data.id,
              productId,
            ],
          );
        } else {
          const { rows: rawUnitRows } = await q(
            `SELECT unit_name AS base_unit_name FROM product_units WHERE product_id = $1 AND is_base = true`,
            [productId],
          );
          const rawUnitInfo = rawUnitRows[0];

          await createProductMovement(q, {
            product_id: productId,
            reference_id: data.id,
            reference_type: "manufacturing",
            action: "create",
            type: "out",
            quantity: newItem.baseQuantity,
            outPrice: newItem.costPrice,
            date: fullDateTime,
            base_unit_name: rawUnitInfo?.base_unit_name || null,
            unit_name: newItem.unit_name,
            conversion_factor: newItem.unit_conversion_factor,
          });
        }
      }

      const rawMaterialCost = Number(rawMaterialCostTotal.toFixed(2));
      const laborCost = Number(data.labor_cost || 0);
      const overheadCost = Number(data.overhead_cost || 0);
      const totalCost = Number(
        (rawMaterialCost + laborCost + overheadCost).toFixed(2),
      );
      const unitCost = Number(
        (outputBaseQuantity > 0 ? totalCost / outputBaseQuantity : 0).toFixed(
          2,
        ),
      );

      // ---- Apply output delta + overwrite cost_price ----
      if (outputDelta !== 0) {
        await q(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [
          outputDelta,
          data.output_product_id,
        ]);
      }
      await q(`UPDATE products SET cost_price = $1 WHERE id = $2`, [
        unitCost,
        data.output_product_id,
      ]);

      await q(
        `UPDATE product_movements
         SET quantity = $1, enter_price = $2, action = 'update', date = $3,
             unit_name = $4, conversion_factor = $5
         WHERE reference_type = 'manufacturing' AND reference_id = $6 AND product_id = $7 AND type = 'in'`,
        [
          outputBaseQuantity,
          unitCost,
          fullDateTime,
          data.output_unit_name || null,
          outputFactor,
          data.id,
          data.output_product_id,
        ],
      );

      // ---- Replace item rows ----
      await q(
        `DELETE FROM manufacturing_order_items WHERE manufacturing_order_id = $1`,
        [data.id],
      );

      for (const item of preparedItems) {
        await q(
          `INSERT INTO manufacturing_order_items
           (manufacturing_order_id, raw_material_product_id, quantity, unit_name,
            unit_conversion_factor, unit_cost_snapshot, line_cost)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            data.id,
            item.raw_material_product_id,
            item.quantity,
            item.unit_name,
            item.unit_conversion_factor,
            item.unitCostSnapshot,
            item.lineCost,
          ],
        );
      }

      // ---- Update header ----
      const orderName = data.order_name?.trim() || oldOrder.order_name;

      await q(
        `UPDATE manufacturing_orders
         SET order_name = $1, bom_id = $2, output_quantity = $3, output_unit_name = $4,
             output_unit_conversion_factor = $5, labor_cost = $6, overhead_cost = $7,
             raw_material_cost = $8, total_cost = $9, unit_cost = $10, date = $11,
             description = $12, updated_by = $13, updated_at = now()
         WHERE id = $14`,
        [
          orderName,
          data.bom_id || null,
          outputQuantity,
          data.output_unit_name || null,
          outputFactor,
          laborCost,
          overheadCost,
          rawMaterialCost,
          totalCost,
          unitCost,
          fullDateTime,
          data.description?.trim() || null,
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

  // DELETE
  ipcMain.handle("delete-manufacturing-order", async (event, id) => {
    const { rows: orderRows } = await query(
      `SELECT * FROM manufacturing_orders WHERE id = $1`,
      [id],
    );
    const order = orderRows[0];

    if (!order) {
      return { success: false, error: "MANUFACTURING_ORDER_NOT_FOUND" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const outputBaseQuantity =
        Number(order.output_quantity) *
        Number(order.output_unit_conversion_factor || 1);

      // ---- Guard: enough of the output must still be in stock to reverse ----
      const { rows: outputProductRows } = await q(
        `SELECT quantity FROM products WHERE id = $1`,
        [order.output_product_id],
      );
      const outputProduct = outputProductRows[0];

      if (Number(outputProduct.quantity) < outputBaseQuantity) {
        throw new Error("CANNOT_DELETE_ORDER_STOCK_ALREADY_CONSUMED");
      }

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

      const { rows: items } = await q(
        `SELECT * FROM manufacturing_order_items WHERE manufacturing_order_id = $1`,
        [id],
      );

      // ---- Reverse output: subtract what manufacturing had added ----
      await q(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [
        outputBaseQuantity,
        order.output_product_id,
      ]);

      await createProductMovement(q, {
        product_id: order.output_product_id,
        reference_id: id,
        reference_type: "manufacturing",
        action: "delete",
        type: "out",
        quantity: outputBaseQuantity,
        outPrice: order.unit_cost,
        date,
      });

      // ---- Reverse raw materials: add back what manufacturing had consumed ----
      for (const item of items) {
        const baseQuantity =
          Number(item.quantity) * Number(item.unit_conversion_factor || 1);

        await q(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [
          baseQuantity,
          item.raw_material_product_id,
        ]);

        await createProductMovement(q, {
          product_id: item.raw_material_product_id,
          reference_id: id,
          reference_type: "manufacturing",
          action: "delete",
          type: "in",
          quantity: baseQuantity,
          enterPrice: item.unit_cost_snapshot,
          date,
        });
      }

      await q(
        `DELETE FROM manufacturing_order_items WHERE manufacturing_order_id = $1`,
        [id],
      );
      await q(`DELETE FROM manufacturing_orders WHERE id = $1`, [id]);

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
