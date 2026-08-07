// productUpdateImport.js
import ExcelJS from "exceljs";
import createProductMovement from "./createPorductMovment";

// Maps picker field keys to the actual column headers they control.
// "baseUnit" bundles unit_code + price since they're one conceptual field
// in the picker. "units" bundles every unitN_* column group together —
// units are all-or-nothing, not lockable per individual slot.
function fieldToColumnsMap(unitSlotCount) {
  return {
    name: ["name"],
    latinName: ["latinName"],
    code: ["code"],
    costPrice: ["costPrice"],
    baseUnit: ["unit_code", "price"],
    tax: ["tax"],
    description: ["description"],
    quantity: ["quantity"],
    barcodes: ["barcodes"],
    units: Array.from({ length: unitSlotCount }, (_, i) => 2 + i).flatMap(
      (n) => [
        `unit${n}_id`,
        `unit${n}_name`,
        `unit${n}_conversion_factor`,
        `unit${n}_price`,
        `unit${n}_barcode`,
      ]
    ),
  };
}

export async function exportProductsForUpdate(db, fields) {
  const enabled = new Set(fields || []);

  const products = db
    .prepare(
      `
        SELECT
          products.*,
          products.type AS type,
          unit.code AS unit_code,
          taxes.name AS tax_name,
          taxes.rate AS tax_rate
        FROM products
        LEFT JOIN unit ON unit.id = products.unit_id
        LEFT JOIN taxes ON taxes.id = products.tax_id
        ORDER BY products.id ASC
      `
    )
    .all();

  if (!products.length) {
    throw new Error("NO_PRODUCTS_TO_EXPORT");
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

  const barcodeRows = db
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
  for (const row of barcodeRows) {
    if (!barcodesByProduct.has(row.product_id)) {
      barcodesByProduct.set(row.product_id, []);
    }
    barcodesByProduct.get(row.product_id).push(row.barcode);
  }

  // Widest extra-unit count across all products, plus 2 always-empty slots
  // for adding new units — same "extra slot" convention as the create
  // template's unit2_* group.
  let maxExtraUnits = 0;
  for (const productId of productIds) {
    const extraCount = (unitsByProduct.get(productId) || []).filter(
      (u) => !u.is_base
    ).length;
    if (extraCount > maxExtraUnits) maxExtraUnits = extraCount;
  }
  const unitSlotCount = maxExtraUnits + 2;
  const fieldToColumns = fieldToColumnsMap(unitSlotCount);

  const unitCodes = db
    .prepare(`SELECT code FROM unit WHERE code IS NOT NULL`)
    .all()
    .map((u) => u.code);

  const taxRows = db
    .prepare(
      `SELECT name, rate FROM taxes
         WHERE category IN ('product', 'both') AND name IS NOT NULL
         ORDER BY name`
    )
    .all();
  const noTaxLabel = "— No Tax —";
  const taxLabels = [
    noTaxLabel,
    ...taxRows.map((t) => `${t.name} (${t.rate}%)`),
  ];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");

  const unitsSheet = workbook.addWorksheet("Units");
  unitsSheet.state = "veryHidden";
  const taxesSheet = workbook.addWorksheet("Taxes");
  taxesSheet.state = "veryHidden";

  // Source of truth for which columns import-time is allowed to read —
  // independent of Excel's own cell-protection, which a user could remove.
  const configSheet = workbook.addWorksheet("_UpdateConfig");
  configSheet.state = "veryHidden";
  Array.from(enabled).forEach((field, i) => {
    configSheet.getCell(`A${i + 1}`).value = field;
  });

  unitCodes.forEach((code, i) => {
    unitsSheet.getCell(`A${i + 1}`).value = code;
  });
  taxLabels.forEach((label, i) => {
    taxesSheet.getCell(`A${i + 1}`).value = label;
  });

  // id is always present and always locked — it's the match key, never a
  // field a user opts into editing.
  const columns = [
    { header: "id", key: "id", width: 10 },
    { header: "name", key: "name", width: 24 },
    { header: "latinName", key: "latinName", width: 24 },
    { header: "code", key: "code", width: 18 },
    { header: "type", key: "type", width: 12 },
    { header: "unit_code", key: "unit_code", width: 14 },
    {
      header: "costPrice",
      key: "costPrice",
      width: 14,
      style: { numFmt: "@" },
    },
    { header: "price", key: "price", width: 14, style: { numFmt: "@" } },
    { header: "tax", key: "tax", width: 20 },
    { header: "quantity", key: "quantity", width: 14, style: { numFmt: "@" } },
    { header: "description", key: "description", width: 32 },
    { header: "barcodes", key: "barcodes", width: 32, style: { numFmt: "@" } },
  ];

  for (let n = 2; n < 2 + unitSlotCount; n++) {
    columns.push(
      { header: `unit${n}_id`, key: `unit${n}_id`, width: 10 },
      { header: `unit${n}_name`, key: `unit${n}_name`, width: 18 },
      {
        header: `unit${n}_conversion_factor`,
        key: `unit${n}_conversion_factor`,
        width: 20,
        style: { numFmt: "@" },
      },
      {
        header: `unit${n}_price`,
        key: `unit${n}_price`,
        width: 14,
        style: { numFmt: "@" },
      },
      {
        header: `unit${n}_barcode`,
        key: `unit${n}_barcode`,
        width: 20,
        style: { numFmt: "@" },
      }
    );
  }

  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  const headerColIndex = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headerColIndex[String(cell.value)] = colNumber;
  });

  const editableColumns = new Set();
  for (const field of enabled) {
    for (const col of fieldToColumns[field] || []) {
      editableColumns.add(col);
    }
  }

  products.forEach((product) => {
    const productUnits = unitsByProduct.get(product.id) || [];
    const baseUnit = productUnits.find((u) => u.is_base);
    const extraUnits = productUnits.filter((u) => !u.is_base);
    const productBarcodes = barcodesByProduct.get(product.id) || [];

    const row = {
      id: product.id,
      name: product.name || "",
      latinName: product.latinName || "",
      code: product.code || "",
      type: product.type,
      unit_code: product.unit_code || "",
      costPrice: product.costPrice,
      price: baseUnit?.sale_price ?? 0,
      tax: product.tax_name
        ? `${product.tax_name} (${product.tax_rate}%)`
        : noTaxLabel,
      quantity: product.quantity,
      description: product.description || "",
      barcodes: productBarcodes.join(", "),
    };

    extraUnits.forEach((unit, i) => {
      const n = i + 2;
      row[`unit${n}_id`] = unit.id;
      row[`unit${n}_name`] = unit.unit_name;
      row[`unit${n}_conversion_factor`] = unit.conversion_factor;
      row[`unit${n}_price`] = unit.sale_price;
      row[`unit${n}_barcode`] = unit.barcode || "";
    });

    sheet.addRow(row);
  });

  const lastRow = products.length + 1;

  if (editableColumns.has("unit_code") && unitCodes.length > 0) {
    const ref = `Units!$A$1:$A$${unitCodes.length}`;
    const col = headerColIndex["unit_code"];
    for (let r = 2; r <= lastRow; r++) {
      sheet.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
      };
    }
  }

  if (editableColumns.has("tax") && taxLabels.length > 0) {
    const ref = `Taxes!$A$1:$A$${taxLabels.length}`;
    const col = headerColIndex["tax"];
    for (let r = 2; r <= lastRow; r++) {
      sheet.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
      };
    }
  }

  // Sheet protection: lock every column NOT in the enabled set. Cosmetic/
  // preventative layer only — the hidden _UpdateConfig sheet is the layer
  // import-time actually trusts.
  sheet.columns.forEach((col, i) => {
    const header = columns[i].key;
    const isLocked = header === "id" || !editableColumns.has(header);

    for (let r = 1; r <= sheet.rowCount; r++) {
      const cell = sheet.getCell(r, i + 1);
      cell.style = {
        ...cell.style,
        protection: { locked: isLocked },
      };
    }
  });

  await sheet.protect("lock123", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
  });
  return workbook.xlsx.writeBuffer();
}

export async function parseProductUpdateImport(db, filePath, fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const configSheet = workbook.getWorksheet("_UpdateConfig");

  if (!configSheet) {
    throw new Error("MISSING_UPDATE_CONFIG");
  }

  const enabled = new Set();
  configSheet.eachRow((row) => {
    const val = String(row.getCell(1).value || "").trim();
    if (val) enabled.add(val);
  });

  const now = new Date();
  const importCreatedAt =
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

  const unitRows = db.prepare(`SELECT id, code, name FROM unit`).all();
  const unitByCode = new Map(unitRows.map((u) => [u.code, u]));

  const taxByName = new Map(
    db
      .prepare(
        `SELECT id, name FROM taxes WHERE category IN ('product', 'both')`
      )
      .all()
      .map((t) => [t.name, t.id])
  );

  const getProductById = db.prepare(`SELECT * FROM products WHERE id = ?`);

  const existingCodes = new Set(
    db
      .prepare(`SELECT code FROM products WHERE code IS NOT NULL`)
      .all()
      .map((p) => p.code)
  );

  const existingBarcodes = new Set(
    db
      .prepare(`SELECT barcode FROM product_barcodes`)
      .all()
      .map((b) => b.barcode)
  );

  const existingUnitBarcodes = new Set(
    db
      .prepare(`SELECT barcode FROM product_units WHERE barcode IS NOT NULL`)
      .all()
      .map((u) => u.barcode)
  );

  const insertImport = db.prepare(`
    INSERT INTO product_imports (file_name, total_rows, created_count, skipped_products_count, skipped_barcodes_count, report_path, createdAt)
    VALUES (?, 0, 0, 0, 0, NULL, ?)
  `);
  const insertImportItem = db.prepare(`
    INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateImportCounts = db.prepare(`
    UPDATE product_imports
    SET total_rows = ?, created_count = ?, skipped_products_count = ?, skipped_barcodes_count = ?, skipped_units_count = ?
    WHERE id = ?
  `);

  const updated = [];
  const skippedProducts = [];
  const skippedBarcodes = [];
  const skippedUnits = [];
  let totalRows = 0;

  const stripTaxLabel = (raw) =>
    String(raw || "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();

  const parseNumberCell = (raw) => {
    if (raw === null || raw === undefined || raw === "") {
      return { value: null, valid: true, blank: true };
    }
    if (raw instanceof Date) {
      return { value: null, valid: false, blank: false };
    }
    const normalized =
      typeof raw === "string" ? raw.trim().replace(",", ".") : raw;
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
      return { value: null, valid: false, blank: false };
    }
    return { value: n, valid: true, blank: false };
  };

  const headerRow = sheet.getRow(1);
  const headerMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value || "").trim();
    if (header) headerMap[header] = colNumber;
  });

  const cellByHeader = (row, header) => {
    const col = headerMap[header];
    return col ? row.getCell(col).value : null;
  };

  const unitGroupPattern = /^unit(\d+)_name$/;
  const unitGroups = Object.keys(headerMap)
    .map((header) => header.match(unitGroupPattern))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
    .map((n) => ({
      n,
      idHeader: `unit${n}_id`,
      nameHeader: `unit${n}_name`,
      factorHeader: `unit${n}_conversion_factor`,
      priceHeader: `unit${n}_price`,
      barcodeHeader: `unit${n}_barcode`,
    }));

  const transaction = db.transaction(() => {
    const importResult = insertImport.run(fileName, importCreatedAt);
    const importId = importResult.lastInsertRowid;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const idRaw = cellByHeader(row, "id");

      const productId = idRaw ? Number(idRaw) : null;
      if (!productId) return; // blank id row = ignored, not counted

      totalRows++;

      const existingProduct = getProductById.get(productId);
      if (!existingProduct) {
        const reason = "productIdNotFound";
        skippedProducts.push({ row: rowNumber, name: `#${productId}`, reason });
        insertImportItem.run(
          importId,
          rowNumber,
          "skipped_product",
          null,
          `#${productId}`,
          null,
          reason
        );
        return;
      }

      const productName = existingProduct.name;
      const updates = {};

      // ---- name ----
      if (enabled.has("name")) {
        const val = String(cellByHeader(row, "name") || "").trim();
        if (val) updates.name = val;
      }

      // ---- latinName ----
      if (enabled.has("latinName")) {
        const val = String(cellByHeader(row, "latinName") || "").trim();
        if (val) updates.latinName = val;
      }

      // ---- code ----
      if (enabled.has("code")) {
        const val = String(cellByHeader(row, "code") || "").trim();
        if (val && val !== existingProduct.code) {
          if (existingCodes.has(val)) {
            const reason = "productCodeExists";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_product",
              productId,
              productName,
              null,
              reason
            );
            return;
          }
          updates.code = val;
        }
      }

      // ---- costPrice ----
      if (enabled.has("costPrice")) {
        const cell = parseNumberCell(cellByHeader(row, "costPrice"));
        if (!cell.valid) {
          const reason = "invalidCostPrice";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_product",
            productId,
            productName,
            null,
            reason
          );
          return;
        }
        if (!cell.blank) updates.costPrice = cell.value;
      }

      // ---- description ----
      if (enabled.has("description")) {
        const val = String(cellByHeader(row, "description") || "").trim();
        if (val) updates.description = val;
      }

      // ---- tax ----
      let taxId; // undefined = don't touch, null = explicit clear (not currently reachable via blank rule), number = set
      if (enabled.has("tax")) {
        const taxLabel = stripTaxLabel(cellByHeader(row, "tax"));
        if (taxLabel) {
          const matchedTaxId = taxByName.get(taxLabel);
          if (!matchedTaxId) {
            const reason = "taxNotFound";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_product",
              productId,
              productName,
              null,
              reason
            );
            return;
          }
          taxId = matchedTaxId;
        }
      }

      // ---- base unit (unit_code + price) ----
      let baseUnitId;
      let baseUnitPrice;
      if (enabled.has("baseUnit")) {
        const unitCode = String(cellByHeader(row, "unit_code") || "").trim();

        if (unitCode) {
          const matchedUnit = unitByCode.get(unitCode);
          if (!matchedUnit) {
            const reason = "unitCodeNotFound";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_product",
              productId,
              productName,
              null,
              reason
            );
            return;
          }
          baseUnitId = matchedUnit.id;
          updates.unit_id = matchedUnit.id;
        }

        const priceCell = parseNumberCell(cellByHeader(row, "price"));
        if (!priceCell.valid) {
          const reason = "invalidSalePrice";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_product",
            productId,
            productName,
            null,
            reason
          );
          return;
        }
        if (!priceCell.blank) baseUnitPrice = priceCell.value;
      }

      // ---- quantity ----
      let quantityDelta = null;
      if (enabled.has("quantity") && existingProduct.type !== "service") {
        const qtyCell = parseNumberCell(cellByHeader(row, "quantity"));
        if (!qtyCell.valid) {
          const reason = "invalidQuantity";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_product",
            productId,
            productName,
            null,
            reason
          );
          return;
        }
        if (!qtyCell.blank && qtyCell.value !== existingProduct.quantity) {
          updates.quantity = qtyCell.value;
          quantityDelta = qtyCell.value - existingProduct.quantity;
        }
      }

      // ---- apply scalar updates ----

      if (Object.keys(updates).length > 0 || taxId !== undefined) {
        const setClauses = [];
        const params = [];

        for (const [col, val] of Object.entries(updates)) {
          setClauses.push(`${col} = ?`);
          params.push(val);
        }
        if (taxId !== undefined) {
          setClauses.push(`tax_id = ?`);
          params.push(taxId);
        }

        if (setClauses.length > 0) {
          params.push(productId);
          db.prepare(
            `UPDATE products SET ${setClauses.join(", ")} WHERE id = ?`
          ).run(...params);

          if (updates.code) existingCodes.add(updates.code);
        }
      }

      // ---- base unit price update (separate table) ----

      if (baseUnitPrice !== undefined) {
        db.prepare(
          `UPDATE product_units SET sale_price = ? WHERE product_id = ? AND is_base = 1`
        ).run(baseUnitPrice, productId);
      }

      // ---- quantity movement log ----
      if (quantityDelta !== null && quantityDelta !== 0) {
        const baseUnitRow = db
          .prepare(
            `SELECT unit_name FROM product_units WHERE product_id = ? AND is_base = 1`
          )
          .get(productId);
        const baseUnitName = baseUnitRow?.unit_name || "Unit";

        createProductMovement(db, {
          product_id: productId,
          reference_id: productId,
          reference_type: "adjustment",
          action: "update",
          type: quantityDelta > 0 ? "in" : "out",
          quantity: Math.abs(quantityDelta),
          enterPrice: updates.costPrice ?? existingProduct.costPrice,
          base_unit_name: baseUnitName,
          unit_name: baseUnitName,
          conversion_factor: 1,
        });
      }

      // ---- barcodes: full replace-the-set ----
      if (enabled.has("barcodes")) {
        const barcodesRaw = String(cellByHeader(row, "barcodes") || "");
        const incomingBarcodes = barcodesRaw
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);

        const currentBarcodeRows = db
          .prepare(
            `SELECT id, barcode FROM product_barcodes WHERE product_id = ?`
          )
          .all(productId);
        const currentBarcodeSet = new Set(
          currentBarcodeRows.map((b) => b.barcode)
        );
        const incomingSet = new Set(incomingBarcodes);

        // Delete barcodes no longer present
        for (const existingBarcode of currentBarcodeRows) {
          if (!incomingSet.has(existingBarcode.barcode)) {
            db.prepare(`DELETE FROM product_barcodes WHERE id = ?`).run(
              existingBarcode.id
            );
            existingBarcodes.delete(existingBarcode.barcode);
          }
        }

        // Insert new barcodes, checked for global uniqueness against OTHER products
        for (const barcode of incomingBarcodes) {
          if (currentBarcodeSet.has(barcode)) continue; // unchanged, already there

          if (existingBarcodes.has(barcode)) {
            const reason = "barcodeAlreadyUsed";
            skippedBarcodes.push({ row: rowNumber, barcode, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_barcode",
              productId,
              productName,
              barcode,
              reason
            );
            continue;
          }

          db.prepare(
            `INSERT INTO product_barcodes (product_id, barcode) VALUES (?, ?)`
          ).run(productId, barcode);
          existingBarcodes.add(barcode);
        }
      }

      // ---- extra units: id-diff update/insert/delete ----
      if (enabled.has("units")) {
        const seenUnitNames = new Set();
        const baseUnitRow = db
          .prepare(
            `SELECT unit_name FROM product_units WHERE product_id = ? AND is_base = 1`
          )
          .get(productId);
        if (baseUnitRow) {
          seenUnitNames.add(baseUnitRow.unit_name.toLowerCase());
        }

        for (const group of unitGroups) {
          const unitIdRaw = cellByHeader(row, group.idHeader);
          const unitId = unitIdRaw ? Number(unitIdRaw) : null;
          const unitName = String(
            cellByHeader(row, group.nameHeader) || ""
          ).trim();

          // id present, name blank => delete
          if (unitId && !unitName) {
            const unitRow = db
              .prepare(`SELECT barcode FROM product_units WHERE id = ?`)
              .get(unitId);
            db.prepare(`DELETE FROM product_units WHERE id = ?`).run(unitId);
            if (unitRow?.barcode) existingUnitBarcodes.delete(unitRow.barcode);
            continue;
          }

          if (!unitName) continue; // fully empty slot, no-op

          if (seenUnitNames.has(unitName.toLowerCase())) {
            const reason = "duplicateUnitName";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_unit",
              productId,
              productName,
              null,
              reason
            );
            continue;
          }

          const factorCell = parseNumberCell(
            cellByHeader(row, group.factorHeader)
          );
          if (!factorCell.valid || factorCell.blank || factorCell.value <= 1) {
            const reason = "invalidConversionFactor";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_unit",
              productId,
              productName,
              null,
              reason
            );
            continue;
          }

          const priceCell = parseNumberCell(
            cellByHeader(row, group.priceHeader)
          );
          if (!priceCell.valid) {
            const reason = "invalidUnitPrice";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            insertImportItem.run(
              importId,
              rowNumber,
              "skipped_unit",
              productId,
              productName,
              null,
              reason
            );
            continue;
          }

          const unitBarcode = String(
            cellByHeader(row, group.barcodeHeader) || ""
          ).trim();

          if (unitId) {
            // update existing unit by id
            const currentUnit = db
              .prepare(`SELECT barcode FROM product_units WHERE id = ?`)
              .get(unitId);

            if (
              unitBarcode &&
              unitBarcode !== currentUnit?.barcode &&
              existingUnitBarcodes.has(unitBarcode)
            ) {
              const reason = "unitBarcodeAlreadyUsed";
              skippedUnits.push({ row: rowNumber, name: productName, reason });
              insertImportItem.run(
                importId,
                rowNumber,
                "skipped_unit",
                productId,
                productName,
                unitBarcode,
                reason
              );
              continue;
            }

            db.prepare(
              `
              UPDATE product_units
              SET unit_name = ?, conversion_factor = ?, sale_price = ?, barcode = ?
              WHERE id = ?
            `
            ).run(
              unitName,
              factorCell.value,
              priceCell.blank ? 0 : priceCell.value,
              unitBarcode || null,
              unitId
            );

            if (currentUnit?.barcode)
              existingUnitBarcodes.delete(currentUnit.barcode);
            if (unitBarcode) existingUnitBarcodes.add(unitBarcode);
          } else {
            // insert new unit
            if (unitBarcode && existingUnitBarcodes.has(unitBarcode)) {
              const reason = "unitBarcodeAlreadyUsed";
              skippedUnits.push({ row: rowNumber, name: productName, reason });
              insertImportItem.run(
                importId,
                rowNumber,
                "skipped_unit",
                productId,
                productName,
                unitBarcode,
                reason
              );
              continue;
            }

            db.prepare(
              `
              INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
              VALUES (?, ?, ?, 0, ?, ?)
            `
            ).run(
              productId,
              unitName,
              factorCell.value,
              priceCell.blank ? 0 : priceCell.value,
              unitBarcode || null
            );

            if (unitBarcode) existingUnitBarcodes.add(unitBarcode);
          }

          seenUnitNames.add(unitName.toLowerCase());
        }
      }

      updated.push({ row: rowNumber, name: productName, id: productId });
    });

    updateImportCounts.run(
      totalRows,
      updated.length,
      skippedProducts.length,
      skippedBarcodes.length,
      skippedUnits.length,
      importId
    );

    return importId;
  });

  const importId = transaction();

  return { importId, updated, skippedProducts, skippedBarcodes, skippedUnits };
}
