// packages/app/src/backend/product.ipc.js
import { ipcMain, dialog } from "electron";
import fs from "fs";
import { query, getClient } from "../dbConnect.js";
import createProductMovement from "../utils/createPorductMovment";
import {
  generateProductImportTemplate,
  parseProductImport,
} from "../utils/productImport";
import { deleteLogoFile } from "../utils/helpers";
import {
  exportProductsForUpdate,
  parseProductUpdateImport,
} from "../utils/productUpdateImport";

export default function registerProductIPC() {
  ipcMain.handle("create-product", async (event, data) => {
    if (!data.name || !data.unit_id || Number(data.costPrice) < 0) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    const incomingUnitNames = (data.productUnits || [])
      .filter((u) => u.unit_name && Number(u.conversion_factor) > 1)
      .map((u) => String(u.unit_name).trim().toLowerCase());

    const hasDuplicateUnitNames =
      new Set(incomingUnitNames).size !== incomingUnitNames.length;

    if (hasDuplicateUnitNames) {
      return { success: false, error: "DUPLICATE_UNIT_NAME" };
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      const result = await q(
        `INSERT INTO products (name, latin_name, code, description, cost_price, quantity, unit_id, tax_id, logo, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          data.name,
          data.latinName,
          data.code || null,
          data.description || null,
          data.costPrice,
          data.quantity,
          data.unit_id,
          data.tax_id || null,
          data.logo,
          data.type || "normal",
        ],
      );
      const productId = result.rows[0].id;

      const { rows: unitRows } = await q(
        "SELECT name FROM unit WHERE id = $1",
        [data.unit_id],
      );
      const baseUnitName = unitRows[0]?.name || "Unit";

      if (incomingUnitNames.includes(baseUnitName.trim().toLowerCase())) {
        throw new Error("DUPLICATE_UNIT_NAME");
      }

      await q(
        `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
         VALUES ($1,$2,1,true,$3)`,
        [productId, baseUnitName, data.salePrice ?? 0],
      );

      for (const unit of data.productUnits || []) {
        if (!unit.unit_name || !(Number(unit.conversion_factor) > 1)) continue;
        await q(
          `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
           VALUES ($1,$2,$3,false,$4,$5)`,
          [
            productId,
            unit.unit_name,
            unit.conversion_factor,
            unit.sale_price ?? 0,
            unit.barcode || null,
          ],
        );
      }

      await createProductMovement(q, {
        product_id: productId,
        reference_id: productId,
        reference_type: "initial",
        action: "create",
        type: "in",
        quantity: data.quantity,
        enterPrice: data.costPrice,
        base_unit_name: baseUnitName,
        unit_name: baseUnitName,
        conversion_factor: 1,
      });

      await client.query("COMMIT");
      return { success: true, id: productId };
    } catch (err) {
      await client.query("ROLLBACK");

      if (data.logo) {
        deleteLogoFile(data.logo);
      }

      console.error("Failed to create product:", err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("update-product", async (event, data) => {
    if (!data.name || !data.unit_id || Number(data.costPrice) < 0) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    const incomingUnitNames = (data.productUnits || [])
      .filter((u) => u.unit_name && Number(u.conversion_factor) > 1)
      .map((u) => String(u.unit_name).trim().toLowerCase());

    const hasDuplicateUnitNames =
      new Set(incomingUnitNames).size !== incomingUnitNames.length;

    if (hasDuplicateUnitNames) {
      return { success: false, error: "DUPLICATE_UNIT_NAME" };
    }

    const { rows: existingRows } = await query(
      "SELECT logo FROM products WHERE id = $1",
      [data.id],
    );
    const oldLogo = existingRows[0]?.logo || null;

    const client = await getClient();
    try {
      await client.query("BEGIN");
      const q = client.query.bind(client);

      await q(
        `UPDATE products
         SET name=$1, latin_name=$2, code=$3, description=$4, cost_price=$5, quantity=$6, unit_id=$7, tax_id=$8, logo=$9
         WHERE id=$10`,
        [
          data.name,
          data.latinName,
          data.code || null,
          data.description || null,
          data.costPrice,
          data.quantity,
          data.unit_id,
          data.tax_id || null,
          data.logo,
          data.id,
        ],
      );

      const { rows: baseUnitRows } = await q(
        `SELECT unit_name FROM product_units WHERE product_id = $1 AND is_base = true`,
        [data.id],
      );
      const baseUnitName = baseUnitRows[0]?.unit_name || "Unit";

      if (incomingUnitNames.includes(baseUnitName.trim().toLowerCase())) {
        throw new Error("DUPLICATE_UNIT_NAME");
      }

      if (data.quantity !== data.oldQuantity) {
        const delta = data.quantity - data.oldQuantity;
        await createProductMovement(q, {
          product_id: data.id,
          reference_id: data.id,
          reference_type: "adjustment",
          action: "update",
          type: delta > 0 ? "in" : "out",
          quantity: Math.abs(delta),
          enterPrice: data.costPrice,
          base_unit_name: baseUnitName,
          unit_name: baseUnitName,
          conversion_factor: 1,
        });
      }

      await q(
        `UPDATE product_units SET sale_price = $1 WHERE product_id = $2 AND is_base = true`,
        [data.salePrice ?? 0, data.id],
      );

      const { rows: existingUnits } = await q(
        `SELECT id FROM product_units WHERE product_id = $1 AND is_base = false`,
        [data.id],
      );

      const incomingUnits = data.productUnits || [];
      const incomingIds = new Set(
        incomingUnits.filter((u) => u.id).map((u) => u.id),
      );

      for (const existingUnit of existingUnits) {
        if (!incomingIds.has(existingUnit.id)) {
          await q("DELETE FROM product_units WHERE id = $1", [existingUnit.id]);
        }
      }

      for (const unit of incomingUnits) {
        if (!unit.unit_name || !(Number(unit.conversion_factor) > 1)) continue;

        if (unit.id) {
          await q(
            `UPDATE product_units
             SET unit_name = $1, conversion_factor = $2, sale_price = $3, barcode = $4
             WHERE id = $5`,
            [
              unit.unit_name,
              unit.conversion_factor,
              unit.sale_price ?? 0,
              unit.barcode || null,
              unit.id,
            ],
          );
        } else {
          await q(
            `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
             VALUES ($1,$2,$3,false,$4,$5)`,
            [
              data.id,
              unit.unit_name,
              unit.conversion_factor,
              unit.sale_price ?? 0,
              unit.barcode || null,
            ],
          );
        }
      }

      await client.query("COMMIT");

      if (oldLogo && oldLogo !== data.logo) {
        deleteLogoFile(oldLogo);
      }

      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Failed to update product:", err);
      return { success: false, error: err.message || String(err) };
    } finally {
      client.release();
    }
  });

  ipcMain.handle("update-product-tax", async (event, data) => {
    if (!data?.product_id) {
      return { success: false, error: "product_id is required" };
    }

    const taxId = data.tax_id || null;

    try {
      if (taxId !== null) {
        const { rows } = await query("SELECT id FROM taxes WHERE id = $1", [
          taxId,
        ]);
        if (!rows[0]) {
          return { success: false, error: "Tax not found" };
        }
      }

      const result = await query(
        `UPDATE products SET tax_id = $1 WHERE id = $2`,
        [taxId, data.product_id],
      );

      if (result.rowCount === 0) {
        return { success: false, error: "Product not found" };
      }

      return { success: true, id: data.product_id, tax_id: taxId };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-products", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const search = (params.search || "").trim();

    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(products.name ILIKE $${paramIndex} OR products.code ILIKE $${paramIndex + 1})`,
      );
      queryParams.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    if (params.type) {
      whereConditions.push(`products.type = $${paramIndex}`);
      queryParams.push(params.type);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const { rows } = await query(
      `SELECT
        products.*,
        products.type AS type,
        unit.name AS unit_name,
        unit.code AS unit_code,
        taxes.name AS tax_name,
        taxes.rate AS tax_rate,
        (
          SELECT sale_price FROM product_units
          WHERE product_units.product_id = products.id AND product_units.is_base = true
          LIMIT 1
        ) AS "salePrice",
        (
          SELECT COUNT(*) FROM product_units
          WHERE product_units.product_id = products.id AND product_units.is_base = false
        ) AS "unitCount",
        (
          SELECT json_agg(
            json_build_object(
              'id', pu.id,
              'unit_name', pu.unit_name,
              'conversion_factor', pu.conversion_factor,
              'is_base', pu.is_base,
              'sale_price', pu.sale_price,
              'barcode', pu.barcode
            )
          )
          FROM product_units pu
          WHERE pu.product_id = products.id
        ) AS "productUnits"

      FROM products

      LEFT JOIN unit ON unit.id = products.unit_id
      LEFT JOIN taxes ON taxes.id = products.tax_id

      ${whereClause}

      ORDER BY products.id DESC

      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, limit, offset],
    );

    const data = rows.map((row) => ({
      ...row,
      productUnits: row.productUnits || [],
    }));

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total
       FROM products
       LEFT JOIN unit ON unit.id = products.unit_id
       ${whereClause}`,
      queryParams,
    );
    const total = Number(totalRows[0].total);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-product", async (event, id) => {
    const { rows: productRows } = await query(
      `SELECT
        products.*,
        products.type AS type,
        unit.name as unit_name,
        unit.code as unit_code,
        taxes.name as tax_name,
        taxes.rate as tax_rate
      FROM products
      LEFT JOIN unit ON unit.id = products.unit_id
      LEFT JOIN taxes ON taxes.id = products.tax_id
      WHERE products.id = $1`,
      [id],
    );
    const product = productRows[0];

    if (!product) return null;

    const { rows: productUnits } = await query(
      `SELECT id, unit_name, conversion_factor, is_base, sale_price, barcode
       FROM product_units
       WHERE product_id = $1
       ORDER BY is_base DESC, id ASC`,
      [id],
    );

    const baseUnit = productUnits.find((u) => u.is_base);

    const { rows: barcodes } = await query(
      `SELECT id, barcode FROM product_barcodes WHERE product_id = $1 ORDER BY id ASC`,
      [id],
    );

    return {
      ...product,
      salePrice: baseUnit?.sale_price ?? 0,
      productUnits,
      barcodes,
    };
  });

  ipcMain.handle("get-pos-products", async (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const search = (params.search || "").trim();

    if (search) {
      const { rows: unitMatchRows } = await query(
        `SELECT
          products.id AS product_id,
          products.name,
          products.logo,
          products.quantity,
          products.type,
          pu.id AS unit_id,
          pu.unit_name,
          pu.conversion_factor,
          pu.sale_price,
          pu.is_base,
          taxes.id AS tax_id,
          taxes.rate AS tax_rate
        FROM product_units pu
        JOIN products ON products.id = pu.product_id
        LEFT JOIN taxes
          ON taxes.id = products.tax_id
          AND taxes.category IN ('product', 'both')
        WHERE pu.barcode = $1`,
        [search],
      );
      let barcodeMatch = unitMatchRows[0];

      if (!barcodeMatch) {
        const { rows: baseMatchRows } = await query(
          `SELECT
            products.id AS product_id,
            products.name,
            products.logo,
            products.quantity,
            products.type,
            pu.id AS unit_id,
            pu.unit_name,
            pu.conversion_factor,
            pu.sale_price,
            true AS is_base,
            taxes.id AS tax_id,
            taxes.rate AS tax_rate
          FROM product_barcodes pb
          JOIN products ON products.id = pb.product_id
          LEFT JOIN product_units pu
            ON pu.product_id = products.id AND pu.is_base = true
          LEFT JOIN taxes
            ON taxes.id = products.tax_id
            AND taxes.category IN ('product', 'both')
          WHERE pb.barcode = $1`,
          [search],
        );
        barcodeMatch = baseMatchRows[0];
      }

      if (barcodeMatch) {
        const isService = barcodeMatch.type === "service";
        const factor = Number(barcodeMatch.conversion_factor) || 1;
        const rawUnitQuantity = factor
          ? barcodeMatch.quantity / factor
          : barcodeMatch.quantity;
        const unitQuantity = barcodeMatch.is_base
          ? rawUnitQuantity
          : Math.floor(rawUnitQuantity);

        const tile = {
          id: `${barcodeMatch.product_id}-${barcodeMatch.unit_id}`,
          product_id: barcodeMatch.product_id,
          unit_id: barcodeMatch.unit_id,
          name: barcodeMatch.is_base
            ? barcodeMatch.name
            : `${barcodeMatch.name} (${barcodeMatch.unit_name})`,
          unit_name: barcodeMatch.unit_name,
          base_unit_name: barcodeMatch.is_base ? barcodeMatch.unit_name : null,
          is_base: Boolean(barcodeMatch.is_base),
          conversion_factor: factor,
          price: barcodeMatch.sale_price,
          tax_id: barcodeMatch.tax_id,
          tax_rate: Number(barcodeMatch.tax_rate || 0),
          logo: barcodeMatch.logo,
          type: barcodeMatch.type,
          base_quantity: isService ? null : barcodeMatch.quantity,
          quantity: isService ? null : unitQuantity,
        };

        return { data: [tile], page: 1, limit, total: 1, totalPages: 1 };
      }
    }

    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(
        `(products.name ILIKE $${paramIndex} OR products.code ILIKE $${paramIndex + 1})`,
      );
      queryParams.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    if (params.type) {
      whereConditions.push(`products.type = $${paramIndex}`);
      queryParams.push(params.type);
      paramIndex++;
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const { rows: products } = await query(
      `SELECT
        products.id,
        products.name,
        products.logo,
        products.quantity,
        products.type,
        taxes.id AS tax_id,
        taxes.rate AS tax_rate
      FROM products
      LEFT JOIN taxes
        ON taxes.id = products.tax_id
        AND taxes.category IN ('product', 'both')
      ${whereClause}
      ORDER BY products.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM products ${whereClause}`,
      queryParams,
    );
    const total = Number(totalRows[0].total);

    if (!products.length) {
      return {
        data: [],
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
    }

    const productIds = products.map((p) => p.id);
    const idPlaceholders = productIds.map((_, i) => `$${i + 1}`).join(",");

    const { rows: units } = await query(
      `SELECT id, product_id, unit_name, conversion_factor, is_base, sale_price, barcode
       FROM product_units
       WHERE product_id IN (${idPlaceholders})
       ORDER BY product_id ASC, is_base DESC, id ASC`,
      productIds,
    );

    const unitsByProduct = new Map();
    for (const unit of units) {
      if (!unitsByProduct.has(unit.product_id)) {
        unitsByProduct.set(unit.product_id, []);
      }
      unitsByProduct.get(unit.product_id).push(unit);
    }

    const { rows: productBarcodeRows } = await query(
      `SELECT product_id, barcode
       FROM product_barcodes
       WHERE product_id IN (${idPlaceholders})
       ORDER BY product_id ASC, id ASC`,
      productIds,
    );

    const barcodesByProduct = new Map();
    for (const row of productBarcodeRows) {
      if (!barcodesByProduct.has(row.product_id)) {
        barcodesByProduct.set(row.product_id, []);
      }
      barcodesByProduct.get(row.product_id).push(row.barcode);
    }

    const data = [];

    for (const product of products) {
      const productUnits = unitsByProduct.get(product.id) || [];
      const baseUnit = productUnits.find((u) => u.is_base);
      const isService = product.type === "service";
      const productLevelBarcodes = barcodesByProduct.get(product.id) || [];

      for (const unit of productUnits) {
        const factor = Number(unit.conversion_factor) || 1;
        const rawUnitQuantity = factor
          ? product.quantity / factor
          : product.quantity;
        const unitQuantity = unit.is_base
          ? rawUnitQuantity
          : Math.floor(rawUnitQuantity);

        const resolvedBarcode = unit.is_base
          ? unit.barcode || productLevelBarcodes[0] || null
          : unit.barcode || null;

        data.push({
          id: `${product.id}-${unit.id}`,
          product_id: product.id,
          unit_id: unit.id,
          name: unit.is_base
            ? product.name
            : `${product.name} (${unit.unit_name})`,
          unit_name: unit.unit_name,
          base_unit_name: baseUnit?.unit_name ?? null,
          is_base: Boolean(unit.is_base),
          conversion_factor: factor,
          price: unit.sale_price,
          barcode: resolvedBarcode,
          tax_id: product.tax_id,
          tax_rate: Number(product.tax_rate || 0),
          logo: product.logo,
          type: product.type,
          base_quantity: isService ? null : product.quantity,
          quantity: isService ? null : unitQuantity,
        });
      }
    }

    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  });

  ipcMain.handle("delete-product", async (event, id) => {
    try {
      const { rows: existingRows } = await query(
        "SELECT logo FROM products WHERE id = $1",
        [id],
      );
      const logoToDelete = existingRows[0]?.logo || null;

      const client = await getClient();
      try {
        await client.query("BEGIN");

        const { rows: purchaseRows } = await client.query(
          "SELECT COUNT(*) as count FROM purchase_invoice_items WHERE product_id = $1",
          [id],
        );
        const { rows: salesRows } = await client.query(
          "SELECT COUNT(*) as count FROM sales_invoice_items WHERE product_id = $1",
          [id],
        );

        if (
          Number(purchaseRows[0].count) > 0 ||
          Number(salesRows[0].count) > 0
        ) {
          throw new Error("Product is used in invoices");
        }

        await client.query("DELETE FROM product_units WHERE product_id = $1", [
          id,
        ]);
        await client.query(
          "DELETE FROM product_barcodes WHERE product_id = $1",
          [id],
        );
        await client.query(
          "DELETE FROM product_movements WHERE product_id = $1",
          [id],
        );
        await client.query("DELETE FROM products WHERE id = $1", [id]);

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      if (logoToDelete) {
        deleteLogoFile(logoToDelete);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-product-by-barcode", async (event, barcode) => {
    const { rows: unitMatchRows } = await query(
      `SELECT
        p.*,
        pu.id AS unit_id,
        pu.unit_name AS unit_name,
        pu.conversion_factor AS conversion_factor,
        pu.sale_price AS price,
        pu.is_base AS is_base,
        taxes.id AS tax_id,
        taxes.rate AS tax_rate
      FROM product_units pu
      JOIN products p ON p.id = pu.product_id
      LEFT JOIN taxes
        ON taxes.id = p.tax_id
        AND taxes.category IN ('product', 'both')
      WHERE pu.barcode = $1`,
      [barcode],
    );
    const unitMatch = unitMatchRows[0];

    if (unitMatch) {
      const isService = unitMatch.type === "service";
      const isBase = Boolean(unitMatch.is_base);
      const factor = Number(unitMatch.conversion_factor) || 1;
      const rawUnitQuantity = factor
        ? unitMatch.quantity / factor
        : unitMatch.quantity;
      const unitQuantity = isBase
        ? rawUnitQuantity
        : Math.floor(rawUnitQuantity);

      let baseUnit = null;
      if (!isBase) {
        const { rows: baseUnitRows } = await query(
          `SELECT unit_name FROM product_units WHERE product_id = $1 AND is_base = true`,
          [unitMatch.id],
        );
        baseUnit = baseUnitRows[0];
      }

      return {
        ...unitMatch,
        id: `${unitMatch.id}-${unitMatch.unit_id}`,
        product_id: unitMatch.id,
        name: isBase
          ? unitMatch.name
          : `${unitMatch.name} (${unitMatch.unit_name})`,
        base_unit_name: isBase
          ? unitMatch.unit_name
          : (baseUnit?.unit_name ?? null),
        is_base: isBase,
        conversion_factor: factor,
        tax_id: unitMatch.tax_id,
        tax_rate: Number(unitMatch.tax_rate || 0),
        base_quantity: isService ? null : unitMatch.quantity,
        quantity: isService ? null : unitQuantity,
      };
    }

    const { rows: barcodeRows } = await query(
      `SELECT p.*, taxes.id AS tax_id, taxes.rate AS tax_rate
       FROM product_barcodes pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN taxes
         ON taxes.id = p.tax_id
         AND taxes.category IN ('product', 'both')
       WHERE pb.barcode = $1`,
      [barcode],
    );
    const row = barcodeRows[0];

    if (!row) return null;

    const isService = row.type === "service";

    const { rows: baseUnitRows } = await query(
      `SELECT id, unit_name, conversion_factor, sale_price
       FROM product_units
       WHERE product_id = $1 AND is_base = true
       LIMIT 1`,
      [row.id],
    );
    const baseUnit = baseUnitRows[0];

    return {
      ...row,
      id: `${row.id}-${baseUnit?.id ?? "base"}`,
      product_id: row.id,
      unit_id: baseUnit?.id ?? null,
      unit_name: baseUnit?.unit_name ?? null,
      base_unit_name: baseUnit?.unit_name ?? null,
      is_base: true,
      conversion_factor: baseUnit?.conversion_factor ?? 1,
      price: baseUnit?.sale_price ?? 0,
      tax_id: row.tax_id,
      tax_rate: Number(row.tax_rate || 0),
      base_quantity: isService ? null : row.quantity,
      quantity: isService ? null : row.quantity,
    };
  });

  ipcMain.handle("get-product-movements", async (event, params = {}) => {
    const product_id = typeof params === "object" ? params.product_id : params;

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    let whereClause = "";
    const queryParams = [];

    if (product_id) {
      whereClause = `WHERE product_movements.product_id = $1`;
      queryParams.push(product_id);
    }

    const limitParamIndex = queryParams.length + 1;

    const { rows: data } = await query(
      `SELECT
        product_movements.*,
        products.name as product_name,
        unit.code as unit_code
      FROM product_movements
      LEFT JOIN products ON products.id = product_movements.product_id
      LEFT JOIN unit ON unit.id = products.unit_id
      ${whereClause}
      ORDER BY product_movements.created_at DESC, product_movements.id DESC
      LIMIT $${limitParamIndex} OFFSET $${limitParamIndex + 1}`,
      [...queryParams, limit, offset],
    );

    const { rows: totalRows } = await query(
      `SELECT COUNT(*) AS total FROM product_movements ${whereClause}`,
      queryParams,
    );
    const total = Number(totalRows[0].total);

    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  });

  ipcMain.handle("download-product-import-template", async () => {
    try {
      const buffer = await generateProductImportTemplate(query);
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: "Save Product Import Template",
        defaultPath: "product-import-template.xlsx",
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      console.error("Failed to generate import template:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("import-products", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Select Product Import File",
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true };

    try {
      const fileName = filePaths[0].split(/[\\/]/).pop();
      const summary = await parseProductImport(
        getClient,
        filePaths[0],
        fileName,
      );

      return { success: true, ...summary };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-product-imports", async () => {
    try {
      const { rows: imports } = await query(
        "SELECT * FROM product_imports ORDER BY id DESC",
      );

      const { rows: statsRows } = await query(
        `SELECT
          COUNT(*) AS total_imports,
          COALESCE(SUM(created_count), 0) AS total_created,
          COALESCE(SUM(skipped_products_count), 0) AS total_skipped_products,
          COALESCE(SUM(skipped_barcodes_count), 0) AS total_skipped_barcodes,
          COALESCE(SUM(skipped_units_count), 0) AS total_skipped_units
        FROM product_imports`,
      );
      const statsRow = statsRows[0];

      return {
        data: imports,
        stats: {
          total_imports: Number(statsRow?.total_imports || 0),
          total_created: Number(statsRow?.total_created || 0),
          total_skipped:
            Number(statsRow?.total_skipped_products || 0) +
            Number(statsRow?.total_skipped_barcodes || 0) +
            Number(statsRow?.total_skipped_units || 0),
        },
      };
    } catch (err) {
      console.error("Failed to load product imports:", err);
      return {
        data: [],
        stats: { total_imports: 0, total_created: 0, total_skipped: 0 },
      };
    }
  });

  ipcMain.handle("get-product-import-items", async (event, importId) => {
    try {
      const { rows } = await query(
        "SELECT * FROM product_import_items WHERE import_id = $1 ORDER BY row_number ASC",
        [importId],
      );
      return rows;
    } catch (err) {
      console.error("Failed to load product import items:", err);
      return [];
    }
  });

  ipcMain.handle("export-products-for-update", async (event, { fields }) => {
    try {
      const buffer = await exportProductsForUpdate(query, fields);
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: "Save Product Update File",
        defaultPath: "product-update-export.xlsx",
        filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      console.error("Failed to export products for update:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("import-products-update", async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Select Product Update File",
      filters: [{ name: "Excel Files", extensions: ["xlsx"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return { success: false, canceled: true };

    try {
      const fileName = filePaths[0].split(/[\\/]/).pop();
      const summary = await parseProductUpdateImport(
        getClient,
        filePaths[0],
        fileName,
      );

      return { success: true, ...summary };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
}
