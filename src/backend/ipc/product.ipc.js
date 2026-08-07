import { ipcMain, dialog } from "electron";
import fs from "fs";
import db from "../db";
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
  ipcMain.handle("create-product", (event, data) => {
    if (!data.name || !data.unit_id || Number(data.costPrice) < 0) {
      return { success: false, error: "MISSING_REQUIRED_FIELDS" };
    }

    // Duplicate unit names within the same product are meaningless (which
    // one would POS/pricing resolve to?) — checked here, not via a DB unique
    // constraint, since unit_name is only unique *within* a product, not
    // globally, and better-sqlite3 doesn't scope composite uniqueness
    // conditionally on is_base.
    const incomingUnitNames = (data.productUnits || [])
      .filter((u) => u.unit_name && Number(u.conversion_factor) > 1)
      .map((u) => String(u.unit_name).trim().toLowerCase());

    const hasDuplicateUnitNames =
      new Set(incomingUnitNames).size !== incomingUnitNames.length;

    if (hasDuplicateUnitNames) {
      return { success: false, error: "DUPLICATE_UNIT_NAME" };
    }

    const createProductTxn = db.transaction((data) => {
      const result = db
        .prepare(
          `
        INSERT INTO products (name, latinName, code, description, costPrice, quantity, unit_id, tax_id, logo, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          data.name,
          data.latinName,
          data.code || null,
          data.description || null,
          data.costPrice,
          data.quantity,
          data.unit_id,
          data.tax_id || null,
          data.logo,
          data.type || "normal"
        );
      const productId = result.lastInsertRowid;

      const unitRow = db
        .prepare(`SELECT name FROM unit WHERE id = ?`)
        .get(data.unit_id);
      const baseUnitName = unitRow?.name || "Unit";

      // A selling unit sharing the base unit's name would be ambiguous
      // (two rows both meaning "the base"), so it's blocked the same way.
      if (incomingUnitNames.includes(baseUnitName.trim().toLowerCase())) {
        throw new Error("DUPLICATE_UNIT_NAME");
      }

      db.prepare(
        `
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
        VALUES (?, ?, 1, 1, ?)
      `
      ).run(productId, baseUnitName, data.salePrice ?? 0);

      const insertUnit = db.prepare(
        `
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      );

      for (const unit of data.productUnits || []) {
        if (!unit.unit_name || !(Number(unit.conversion_factor) > 1)) continue;
        insertUnit.run(
          productId,
          unit.unit_name,
          unit.conversion_factor,
          unit.sale_price ?? 0,
          unit.barcode || null
        );
      }

      createProductMovement(db, {
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

      return productId;
    });

    try {
      const productId = createProductTxn(data);
      return { success: true, id: productId };
    } catch (err) {
      if (data.logo) {
        deleteLogoFile(data.logo);
      }

      console.error("Failed to create product:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("update-product", (event, data) => {
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

    const existing = db
      .prepare(`SELECT logo FROM products WHERE id = ?`)
      .get(data.id);
    const oldLogo = existing?.logo || null;

    const updateProductTxn = db.transaction((data) => {
      db.prepare(
        `
        UPDATE products
        SET name=?, latinName=?, code=?, description=?, costPrice=?, quantity=?, unit_id=?, tax_id=?, logo=?
        WHERE id=?
      `
      ).run(
        data.name,
        data.latinName,
        data.code || null,
        data.description || null,
        data.costPrice,
        data.quantity,
        data.unit_id,
        data.tax_id || null,
        data.logo,
        data.id
      );

      const baseUnit = db
        .prepare(
          `SELECT unit_name FROM product_units WHERE product_id = ? AND is_base = 1`
        )
        .get(data.id);
      const baseUnitName = baseUnit?.unit_name || "Unit";

      if (incomingUnitNames.includes(baseUnitName.trim().toLowerCase())) {
        throw new Error("DUPLICATE_UNIT_NAME");
      }

      if (data.quantity !== data.oldQuantity) {
        const delta = data.quantity - data.oldQuantity;
        createProductMovement(db, {
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

      db.prepare(
        `
        UPDATE product_units
        SET sale_price = ?
        WHERE product_id = ? AND is_base = 1
      `
      ).run(data.salePrice ?? 0, data.id);

      const existingUnits = db
        .prepare(
          `SELECT id FROM product_units WHERE product_id = ? AND is_base = 0`
        )
        .all(data.id);

      const incomingUnits = data.productUnits || [];
      const incomingIds = new Set(
        incomingUnits.filter((u) => u.id).map((u) => u.id)
      );

      const deleteUnit = db.prepare(`DELETE FROM product_units WHERE id = ?`);
      for (const existing of existingUnits) {
        if (!incomingIds.has(existing.id)) {
          deleteUnit.run(existing.id);
        }
      }

      const updateUnit = db.prepare(
        `
        UPDATE product_units
        SET unit_name = ?, conversion_factor = ?, sale_price = ?, barcode = ?
        WHERE id = ?
      `
      );
      const insertUnit = db.prepare(
        `
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
        VALUES (?, ?, ?, 0, ?, ?)
      `
      );

      for (const unit of incomingUnits) {
        if (!unit.unit_name || !(Number(unit.conversion_factor) > 1)) continue;

        if (unit.id) {
          updateUnit.run(
            unit.unit_name,
            unit.conversion_factor,
            unit.sale_price ?? 0,
            unit.barcode || null,
            unit.id
          );
        } else {
          insertUnit.run(
            data.id,
            unit.unit_name,
            unit.conversion_factor,
            unit.sale_price ?? 0,
            unit.barcode || null
          );
        }
      }
    });

    try {
      updateProductTxn(data);

      if (oldLogo && oldLogo !== data.logo) {
        deleteLogoFile(oldLogo);
      }

      return { success: true };
    } catch (err) {
      console.error("Failed to update product:", err);
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("update-product-tax", (event, data) => {
    if (!data?.product_id) {
      return { success: false, error: "product_id is required" };
    }

    // tax_id is allowed to be null — lets a user clear the product's default
    // tax entirely, not just switch between two taxes.
    const taxId = data.tax_id || null;

    try {
      if (taxId !== null) {
        const taxExists = db
          .prepare(`SELECT id FROM taxes WHERE id = ?`)
          .get(taxId);

        if (!taxExists) {
          return { success: false, error: "Tax not found" };
        }
      }

      const result = db
        .prepare(
          `
          UPDATE products
          SET tax_id = ?
          WHERE id = ?
        `
        )
        .run(taxId, data.product_id);

      if (result.changes === 0) {
        return { success: false, error: "Product not found" };
      }

      return { success: true, id: data.product_id, tax_id: taxId };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-products", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const search = (params.search || "").trim();

    const whereConditions = [];
    const queryParams = [];

    if (search) {
      whereConditions.push(`(products.name LIKE ? OR products.code LIKE ?)`);
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (params.type) {
      whereConditions.push(`products.type = ?`);
      queryParams.push(params.type);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const data = db
      .prepare(
        `
      SELECT
        products.*,
        products.type AS type,
        unit.name AS unit_name,
        unit.code AS unit_code,
        taxes.name AS tax_name,
        taxes.rate AS tax_rate,
        (
          SELECT sale_price FROM product_units
          WHERE product_units.product_id = products.id AND product_units.is_base = 1
          LIMIT 1
        ) AS salePrice,
        (
          SELECT COUNT(*) FROM product_units
          WHERE product_units.product_id = products.id AND product_units.is_base = 0
        ) AS unitCount,
        (
          SELECT json_group_array(
            json_object(
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
          ORDER BY pu.is_base DESC, pu.id ASC
        ) AS productUnitsJson
  
      FROM products
  
      LEFT JOIN unit
        ON unit.id = products.unit_id
  
      LEFT JOIN taxes
        ON taxes.id = products.tax_id
  
      ${whereClause}
  
      ORDER BY products.id DESC
  
      LIMIT ? OFFSET ?
      `
      )
      .all(...queryParams, limit, offset)
      .map((row) => ({
        ...row,
        productUnits: row.productUnitsJson
          ? JSON.parse(row.productUnitsJson)
          : [],
        productUnitsJson: undefined,
      }));

    const countQuery = db.prepare(`
      SELECT COUNT(*) AS total
      FROM products
      LEFT JOIN unit
        ON unit.id = products.unit_id
      ${whereClause}
  `);

    const { total } = countQuery.get(...queryParams);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("get-product", (event, id) => {
    const product = db
      .prepare(
        `
        SELECT 
          products.*,
          products.type AS type,
          unit.name as unit_name,
          unit.code as unit_code,
          taxes.name as tax_name,
          taxes.rate as tax_rate
        FROM products
        LEFT JOIN unit ON unit.id = products.unit_id
        LEFT JOIN taxes ON taxes.id = products.tax_id
        WHERE products.id = ?
      `
      )
      .get(id);

    if (!product) return null;

    const productUnits = db
      .prepare(
        `
        SELECT id, unit_name, conversion_factor, is_base, sale_price, barcode
        FROM product_units
        WHERE product_id = ?
        ORDER BY is_base DESC, id ASC
      `
      )
      .all(id);

    const baseUnit = productUnits.find((u) => u.is_base);

    // Product-level barcodes (from product_barcodes) are distinct from
    // unit-level barcodes (product_units.barcode) — a product can have
    // several of these (e.g. old packaging codes, alternate scan codes)
    // pointing at the same base unit, whereas a unit's own barcode is a
    // single 1:1 field on that specific unit row.
    const barcodes = db
      .prepare(
        `
        SELECT id, barcode
        FROM product_barcodes
        WHERE product_id = ?
        ORDER BY id ASC
      `
      )
      .all(id);

    return {
      ...product,
      salePrice: baseUnit?.sale_price ?? 0,
      productUnits,
      barcodes,
    };
  });

  ipcMain.handle("get-pos-products", (event, params = {}) => {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const search = (params.search || "").trim();

    // ---- Barcode short-circuit ---- (unchanged)
    if (search) {
      const unitMatch = db
        .prepare(
          `
        SELECT
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
        WHERE pu.barcode = ?
        `
        )
        .get(search);

      const barcodeMatch =
        unitMatch ||
        (() => {
          const baseMatch = db
            .prepare(
              `
            SELECT
              products.id AS product_id,
              products.name,
              products.logo,
              products.quantity,
              products.type,
              pu.id AS unit_id,
              pu.unit_name,
              pu.conversion_factor,
              pu.sale_price,
              1 AS is_base,
              taxes.id AS tax_id,
              taxes.rate AS tax_rate
            FROM product_barcodes pb
            JOIN products ON products.id = pb.product_id
            LEFT JOIN product_units pu
              ON pu.product_id = products.id AND pu.is_base = 1
            LEFT JOIN taxes
              ON taxes.id = products.tax_id
              AND taxes.category IN ('product', 'both')
            WHERE pb.barcode = ?
            `
            )
            .get(search);
          return baseMatch;
        })();

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

        return {
          data: [tile],
          page: 1,
          limit,
          total: 1,
          totalPages: 1,
        };
      }
    }

    // ---- Regular name search / listing ----
    const whereConditions = [];
    const queryParams = [];

    if (search) {
      whereConditions.push(`(products.name LIKE ? OR products.code LIKE ?)`);
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (params.type) {
      whereConditions.push(`products.type = ?`);
      queryParams.push(params.type);
    }

    const whereClause = whereConditions.length
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const products = db
      .prepare(
        `
      SELECT
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
      LIMIT ? OFFSET ?
      `
      )
      .all(...queryParams, limit, offset);

    const countQuery = db.prepare(`
      SELECT COUNT(*) AS total
      FROM products
      ${whereClause}
    `);

    const { total } = countQuery.get(...queryParams);

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
    const placeholders = productIds.map(() => "?").join(",");

    const units = db
      .prepare(
        `
      SELECT id, product_id, unit_name, conversion_factor, is_base, sale_price, barcode
      FROM product_units
      WHERE product_id IN (${placeholders})
      ORDER BY product_id ASC, is_base DESC, id ASC
      `
      )
      .all(...productIds);

    const unitsByProduct = new Map();
    for (const unit of units) {
      if (!unitsByProduct.has(unit.product_id)) {
        unitsByProduct.set(unit.product_id, []);
      }
      unitsByProduct.get(unit.product_id).push(unit);
    }

    // Product-level barcodes — used as a fallback ONLY for the base unit's
    // tile, matching the same fallback logic as the barcode short-circuit
    // above (a base unit's real-world barcode usually lives here, not on
    // product_units.barcode). Batched in one query rather than per-product,
    // same pattern as `units` above.
    const productBarcodeRows = db
      .prepare(
        `
      SELECT product_id, barcode
      FROM product_barcodes
      WHERE product_id IN (${placeholders})
      ORDER BY product_id ASC, id ASC
      `
      )
      .all(...productIds);

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

        // Base unit: its own product_units.barcode wins if set, otherwise
        // fall back to the product's first product_barcodes entry. Non-base
        // units always use their own barcode column only.
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

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });
  ipcMain.handle("delete-product", (event, id) => {
    try {
      const existing = db
        .prepare(`SELECT logo FROM products WHERE id = ?`)
        .get(id);
      const logoToDelete = existing?.logo || null;

      const transaction = db.transaction(() => {
        const usedInPurchase = db
          .prepare(
            `SELECT COUNT(*) as count FROM purchase_invoice_items WHERE product_id = ?`
          )
          .get(id);
        const usedInSales = db
          .prepare(
            `SELECT COUNT(*) as count FROM sales_invoice_items WHERE product_id = ?`
          )
          .get(id);

        if (usedInPurchase.count > 0 || usedInSales.count > 0) {
          throw new Error("Product is used in invoices");
        }

        db.prepare(`DELETE FROM product_units WHERE product_id = ?`).run(id);
        db.prepare(`DELETE FROM product_barcodes WHERE product_id = ?`).run(id);
        db.prepare(`DELETE FROM product_movements WHERE product_id = ?`).run(
          id
        );
        db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
      });

      transaction();

      // Only reached if the transaction committed without throwing.
      if (logoToDelete) {
        deleteLogoFile(logoToDelete);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-product-by-barcode", (event, barcode) => {
    const unitMatch = db
      .prepare(
        `
      SELECT
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
      WHERE pu.barcode = ?
    `
      )
      .get(barcode);

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

      const baseUnit = isBase
        ? null
        : db
            .prepare(
              `SELECT unit_name FROM product_units WHERE product_id = ? AND is_base = 1`
            )
            .get(unitMatch.id);

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

    // Falls back to the product-level barcode table — this still always
    // resolves to the product's base unit, exactly as before.
    const row = db
      .prepare(
        `
      SELECT p.*, taxes.id AS tax_id, taxes.rate AS tax_rate
      FROM product_barcodes pb
      JOIN products p ON p.id = pb.product_id
      LEFT JOIN taxes
        ON taxes.id = p.tax_id
        AND taxes.category IN ('product', 'both')
      WHERE pb.barcode = ?
    `
      )
      .get(barcode);

    if (!row) return null;

    const isService = row.type === "service";

    const baseUnit = db
      .prepare(
        `
      SELECT id, unit_name, conversion_factor, sale_price
      FROM product_units
      WHERE product_id = ? AND is_base = 1
      LIMIT 1
    `
      )
      .get(row.id);

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

  ipcMain.handle("get-product-movements", (event, params = {}) => {
    const product_id = typeof params === "object" ? params.product_id : params; // backward-compat: still accept a bare id

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    let whereClause = "";
    const queryParams = [];

    if (product_id) {
      whereClause = `WHERE product_movements.product_id = ?`;
      queryParams.push(product_id);
    }

    const data = db
      .prepare(
        `
        SELECT 
          product_movements.*,
          products.name as product_name,
          unit.code as unit_code
        FROM product_movements
        LEFT JOIN products ON products.id = product_movements.product_id
        LEFT JOIN unit ON unit.id = products.unit_id
        ${whereClause}
        ORDER BY product_movements.createdAt DESC, product_movements.id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...queryParams, limit, offset);

    const { total } = db
      .prepare(
        `
        SELECT COUNT(*) AS total
        FROM product_movements
        ${whereClause}
        `
      )
      .get(...queryParams);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  });

  ipcMain.handle("download-product-import-template", async () => {
    try {
      const buffer = await generateProductImportTemplate(db);
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
      const summary = await parseProductImport(db, filePaths[0], fileName);

      return { success: true, ...summary };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("get-product-imports", () => {
    try {
      const imports = db
        .prepare(`SELECT * FROM product_imports ORDER BY id DESC`)
        .all();

      const statsRow = db
        .prepare(
          `
          SELECT
            COUNT(*) AS total_imports,
            COALESCE(SUM(created_count), 0) AS total_created,
            COALESCE(SUM(skipped_products_count), 0) AS total_skipped_products,
            COALESCE(SUM(skipped_barcodes_count), 0) AS total_skipped_barcodes,
            COALESCE(SUM(skipped_units_count), 0) AS total_skipped_units
          FROM product_imports
        `
        )
        .get();

      return {
        data: imports,
        stats: {
          total_imports: statsRow?.total_imports || 0,
          total_created: statsRow?.total_created || 0,
          total_skipped:
            (statsRow?.total_skipped_products || 0) +
            (statsRow?.total_skipped_barcodes || 0) +
            (statsRow?.total_skipped_units || 0),
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

  ipcMain.handle("get-product-import-items", (event, importId) => {
    try {
      return db
        .prepare(
          `SELECT * FROM product_import_items WHERE import_id = ? ORDER BY row_number ASC`
        )
        .all(importId);
    } catch (err) {
      console.error("Failed to load product import items:", err);
      return [];
    }
  });

  ipcMain.handle("export-products-for-update", async (event, { fields }) => {
    try {
      const buffer = await exportProductsForUpdate(db, fields);
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
        db,
        filePaths[0],
        fileName
      );

      return { success: true, ...summary };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
}
