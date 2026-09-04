// packages/app/src/backend/bom.ipc.js
import { ipcMain } from "electron";
import { query, getClient } from "../dbConnect.js";

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

async function validateBomItems(q, items, productId) {
  if (!Array.isArray(items) || items.length === 0) {
    return "BOM_ITEMS_REQUIRED";
  }

  const seen = new Set();
  for (const item of items) {
    if (
      !item.raw_material_product_id ||
      !item.quantity ||
      Number(item.quantity) <= 0
    ) {
      return "INVALID_BOM_ITEM";
    }
    if (Number(item.raw_material_product_id) === Number(productId)) {
      return "RAW_MATERIAL_CANNOT_BE_OUTPUT_PRODUCT";
    }
    if (seen.has(item.raw_material_product_id)) {
      return "DUPLICATE_RAW_MATERIAL_IN_BOM";
    }
    seen.add(item.raw_material_product_id);

    try {
      await assertProductIsPhysical(
        q,
        item.raw_material_product_id,
        "SERVICE_PRODUCTS_CANNOT_BE_RAW_MATERIALS",
      );
    } catch (err) {
      return err.message;
    }
  }

  return null;
}

async function insertBomItems(q, bomId, items) {
  for (const item of items) {
    let unitId = null;
    let unitName = null;
    let conversionFactor = 1;

    if (item.unit_id) {
      const { rows } = await q(
        `SELECT id, unit_name, conversion_factor
         FROM product_units
         WHERE id = $1 AND product_id = $2`,
        [item.unit_id, item.raw_material_product_id],
      );
      const unitRow = rows[0];

      if (!unitRow) {
        throw new Error("INVALID_UNIT_FOR_RAW_MATERIAL");
      }

      unitId = unitRow.id;
      unitName = unitRow.unit_name;
      conversionFactor = unitRow.conversion_factor;
    }

    await q(
      `INSERT INTO bom_items
         (bom_id, raw_material_product_id, unit_id, unit_name, unit_conversion_factor, quantity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        bomId,
        item.raw_material_product_id,
        unitId,
        unitName,
        conversionFactor,
        Number(item.quantity),
      ],
    );
  }
}

export default function registerBomsIPC() {
  // CREATE
  ipcMain.handle("create-bom", async (event, data) => {
    const productId = data.product_id;

    if (!productId) {
      return { success: false, error: "MISSING_PRODUCT_ID" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      await assertProductIsPhysical(
        q,
        productId,
        "SERVICE_PRODUCTS_CANNOT_BE_MANUFACTURED",
      );

      const itemsError = await validateBomItems(q, data.items, productId);
      if (itemsError) {
        throw new Error(itemsError);
      }

      const { rows: countRows } = await q(
        `SELECT COUNT(*) AS cnt FROM boms WHERE product_id = $1`,
        [productId],
      );
      const existingCount = Number(countRows[0].cnt);

      const isFirstBom = existingCount === 0;
      const isDefault = isFirstBom ? true : Boolean(data.is_default);

      if (isDefault && !isFirstBom) {
        await q(
          `UPDATE boms SET is_default = false WHERE product_id = $1 AND is_default = true`,
          [productId],
        );
      }

      const bomName =
        data.name && data.name.trim() ? data.name.trim() : "Standard";

      const { rows: bomRows } = await q(
        `INSERT INTO boms (product_id, name, is_default, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [productId, bomName, isDefault, data.notes || null],
      );
      const bomId = bomRows[0].id;

      await insertBomItems(q, bomId, data.items);

      await client.query("COMMIT");
      return { success: true, id: bomId };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  // GET (by product)
  ipcMain.handle("get-boms", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const productId = params.product_id || null;
    const relatedProductId = params.related_product_id || null;
    const search = params.search ? params.search.trim() : null;

    try {
      const whereClauses = [];
      const whereParams = [];
      let paramIndex = 1;

      if (productId) {
        whereClauses.push(`b.product_id = $${paramIndex}`);
        whereParams.push(productId);
        paramIndex++;
      }

      if (relatedProductId) {
        whereClauses.push(
          `EXISTS (SELECT 1 FROM bom_items bi WHERE bi.bom_id = b.id AND bi.raw_material_product_id = $${paramIndex})`,
        );
        whereParams.push(relatedProductId);
        paramIndex++;
      }

      if (search) {
        whereClauses.push(`b.name ILIKE $${paramIndex}`);
        whereParams.push(`%${search}%`);
        paramIndex++;
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";

      const { rows: totalRows } = await query(
        `SELECT COUNT(*) AS total FROM boms b ${whereSql}`,
        whereParams,
      );
      const total = Number(totalRows[0].total);

      const { rows: boms } = await query(
        `SELECT
           b.id,
           b.product_id,
           p.name AS product_name,
           p.code AS product_code,
           b.name,
           b.is_default,
           b.notes,
           b.created_at::text AS created_at,
           b.updated_at::text AS updated_at,
           COALESCE((
             SELECT SUM(bi.quantity * bi.unit_conversion_factor * rp.cost_price)
             FROM bom_items bi
             JOIN products rp ON rp.id = bi.raw_material_product_id
             WHERE bi.bom_id = b.id
           ), 0)::float AS estimated_cost
         FROM boms b
         JOIN products p ON p.id = b.product_id
         ${whereSql}
         ORDER BY b.is_default DESC, b.created_at ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...whereParams, limit, offset],
      );

      if (boms.length === 0) {
        return {
          success: true,
          data: [],
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        };
      }

      const bomIds = boms.map((b) => b.id);
      const placeholders = bomIds.map((_, i) => `$${i + 1}`).join(",");

      const { rows: items } = await query(
        `SELECT
           bi.id, bi.bom_id, bi.raw_material_product_id,
           p.name AS raw_material_name, p.code AS raw_material_code,
           p.cost_price::float AS raw_material_cost_price,
           bi.unit_id, bi.unit_name,
           bi.unit_conversion_factor::float AS unit_conversion_factor,
           bi.quantity::float AS quantity,
           (bi.quantity * bi.unit_conversion_factor * p.cost_price)::float AS line_estimated_cost
         FROM bom_items bi
         JOIN products p ON p.id = bi.raw_material_product_id
         WHERE bi.bom_id IN (${placeholders})
         ORDER BY bi.id ASC`,
        bomIds,
      );

      const itemsByBom = new Map();
      for (const item of items) {
        if (!itemsByBom.has(item.bom_id)) itemsByBom.set(item.bom_id, []);
        itemsByBom.get(item.bom_id).push(item);
      }

      const result = boms.map((bom) => ({
        ...bom,
        items: itemsByBom.get(bom.id) || [],
      }));

      return {
        success: true,
        data: result,
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

  ipcMain.handle("get-bom", async (event, id) => {
    if (!id) {
      return { success: false, error: "MISSING_BOM_ID" };
    }

    try {
      const { rows: bomRows } = await query(
        `SELECT
           b.id,
           b.product_id,
           p.name AS product_name,
           p.code AS product_code,
           b.name,
           b.is_default,
           b.notes,
           b.created_at::text AS created_at,
           b.updated_at::text AS updated_at
         FROM boms b
         JOIN products p ON p.id = b.product_id
         WHERE b.id = $1`,
        [id],
      );
      const bom = bomRows[0];

      if (!bom) {
        return { success: false, error: "BOM_NOT_FOUND" };
      }

      const { rows: items } = await query(
        `SELECT
           bi.id,
           bi.bom_id,
           bi.raw_material_product_id,
           p.name AS raw_material_name,
           p.code AS raw_material_code,
           p.cost_price::float AS raw_material_cost_price,
           bi.unit_id,
           bi.unit_name,
           bi.unit_conversion_factor::float AS unit_conversion_factor,
           bi.quantity::float AS quantity,
           (bi.quantity * bi.unit_conversion_factor * p.cost_price)::float AS line_estimated_cost
         FROM bom_items bi
         JOIN products p ON p.id = bi.raw_material_product_id
         WHERE bi.bom_id = $1
         ORDER BY bi.id ASC`,
        [id],
      );

      // Batch-fetch each raw material's full unit list so the edit form's
      // unit dropdown is populated immediately, without re-selecting the product.
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

      const estimatedCost = items.reduce(
        (sum, item) => sum + Number(item.line_estimated_cost || 0),
        0,
      );

      return {
        success: true,
        data: { ...bom, items, estimated_cost: estimatedCost },
      };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // UPDATE
  ipcMain.handle("update-bom", async (event, data) => {
    const bomId = data.id;

    if (!bomId) {
      return { success: false, error: "MISSING_BOM_ID" };
    }

    const { rows: existingBomRows } = await query(
      `SELECT id, product_id FROM boms WHERE id = $1`,
      [bomId],
    );
    const existingBom = existingBomRows[0];

    if (!existingBom) {
      return { success: false, error: "BOM_NOT_FOUND" };
    }

    const productId = existingBom.product_id;

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      await assertProductIsPhysical(
        q,
        productId,
        "SERVICE_PRODUCTS_CANNOT_BE_MANUFACTURED",
      );

      const itemsError = await validateBomItems(q, data.items, productId);
      if (itemsError) {
        throw new Error(itemsError);
      }

      if (data.is_default === true) {
        await q(
          `UPDATE boms SET is_default = false WHERE product_id = $1 AND id != $2 AND is_default = true`,
          [productId, bomId],
        );
      }

      const bomName =
        data.name && data.name.trim() ? data.name.trim() : "Standard";

      if (data.is_default === true) {
        await q(
          `UPDATE boms
           SET name = $1, notes = $2, is_default = true, updated_at = now()
           WHERE id = $3`,
          [bomName, data.notes || null, bomId],
        );
      } else {
        await q(
          `UPDATE boms
           SET name = $1, notes = $2, updated_at = now()
           WHERE id = $3`,
          [bomName, data.notes || null, bomId],
        );
      }

      await q(`DELETE FROM bom_items WHERE bom_id = $1`, [bomId]);
      await insertBomItems(q, bomId, data.items);

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
  ipcMain.handle("delete-bom", async (event, id) => {
    const { rows: existingBomRows } = await query(
      `SELECT id, product_id, is_default FROM boms WHERE id = $1`,
      [id],
    );
    const existingBom = existingBomRows[0];

    if (!existingBom) {
      return { success: false, error: "BOM_NOT_FOUND" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      await q(`DELETE FROM boms WHERE id = $1`, [id]);

      // If the deleted BOM was the default, promote the oldest remaining one.
      if (existingBom.is_default) {
        const { rows: nextBomRows } = await q(
          `SELECT id FROM boms WHERE product_id = $1 ORDER BY created_at ASC LIMIT 1`,
          [existingBom.product_id],
        );
        const nextBom = nextBomRows[0];

        if (nextBom) {
          await q(`UPDATE boms SET is_default = true WHERE id = $1`, [
            nextBom.id,
          ]);
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
}
