// packages/app/src/backend/utils/productUpdateImport.js
import ExcelJS from "exceljs";
import createProductMovement from "./createPorductMovment";

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
      ],
    ),
  };
}

export async function exportProductsForUpdate(query, fields) {
  const enabled = new Set(fields || []);

  const { rows: products } = await query(
    `SELECT
      products.*,
      products.type AS type,
      unit.code AS unit_code,
      taxes.name AS tax_name,
      taxes.rate AS tax_rate
    FROM products
    LEFT JOIN unit ON unit.id = products.unit_id
    LEFT JOIN taxes ON taxes.id = products.tax_id
    ORDER BY products.id ASC`,
  );

  if (!products.length) {
    throw new Error("NO_PRODUCTS_TO_EXPORT");
  }

  const productIds = products.map((p) => p.id);
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");

  const { rows: units } = await query(
    `SELECT id, product_id, unit_name, conversion_factor, is_base, sale_price, barcode
     FROM product_units
     WHERE product_id IN (${placeholders})
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

  const { rows: barcodeRows } = await query(
    `SELECT product_id, barcode
     FROM product_barcodes
     WHERE product_id IN (${placeholders})
     ORDER BY product_id ASC, id ASC`,
    productIds,
  );

  const barcodesByProduct = new Map();
  for (const row of barcodeRows) {
    if (!barcodesByProduct.has(row.product_id)) {
      barcodesByProduct.set(row.product_id, []);
    }
    barcodesByProduct.get(row.product_id).push(row.barcode);
  }

  let maxExtraUnits = 0;
  for (const productId of productIds) {
    const extraCount = (unitsByProduct.get(productId) || []).filter(
      (u) => !u.is_base,
    ).length;
    if (extraCount > maxExtraUnits) maxExtraUnits = extraCount;
  }
  const unitSlotCount = maxExtraUnits + 2;
  const fieldToColumns = fieldToColumnsMap(unitSlotCount);

  const { rows: unitCodeRows } = await query(
    "SELECT code FROM unit WHERE code IS NOT NULL",
  );
  const unitCodes = unitCodeRows.map((u) => u.code);

  const { rows: taxRows } = await query(
    `SELECT name, rate FROM taxes
     WHERE category IN ('product', 'both') AND name IS NOT NULL
     ORDER BY name`,
  );
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
      },
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
      latinName: product.latin_name || "",
      code: product.code || "",
      type: product.type,
      unit_code: product.unit_code || "",
      costPrice: product.cost_price,
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

export async function parseProductUpdateImport(getClient, filePath, fileName) {
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

  const client = await getClient();
  const q = client.query.bind(client);

  try {
    await client.query("BEGIN");

    const { rows: unitRows } = await q("SELECT id, code, name FROM unit");
    const unitByCode = new Map(unitRows.map((u) => [u.code, u]));

    const { rows: taxRows } = await q(
      "SELECT id, name FROM taxes WHERE category IN ('product', 'both')",
    );
    const taxByName = new Map(taxRows.map((t) => [t.name, t.id]));

    const { rows: codeRows } = await q(
      "SELECT code FROM products WHERE code IS NOT NULL",
    );
    const existingCodes = new Set(codeRows.map((p) => p.code));

    const { rows: barcodeRows } = await q(
      "SELECT barcode FROM product_barcodes",
    );
    const existingBarcodes = new Set(barcodeRows.map((b) => b.barcode));

    const { rows: unitBarcodeRows } = await q(
      "SELECT barcode FROM product_units WHERE barcode IS NOT NULL",
    );
    const existingUnitBarcodes = new Set(unitBarcodeRows.map((u) => u.barcode));

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

    const importResult = await q(
      `INSERT INTO product_imports (file_name, total_rows, created_count, skipped_products_count, skipped_barcodes_count, report_path, created_at)
       VALUES ($1, 0, 0, 0, 0, NULL, $2)
       RETURNING id`,
      [fileName, importCreatedAt],
    );
    const importId = importResult.rows[0].id;

    const rowsToProcess = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rowsToProcess.push({ row, rowNumber });
    });

    for (const { row, rowNumber } of rowsToProcess) {
      const idRaw = cellByHeader(row, "id");
      const productId = idRaw ? Number(idRaw) : null;
      if (!productId) continue;

      totalRows++;

      const { rows: existingProductRows } = await q(
        "SELECT * FROM products WHERE id = $1",
        [productId],
      );
      const existingProduct = existingProductRows[0];

      if (!existingProduct) {
        const reason = "productIdNotFound";
        skippedProducts.push({ row: rowNumber, name: `#${productId}`, reason });
        await q(
          `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
           VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
          [importId, rowNumber, `#${productId}`, reason],
        );
        continue;
      }

      const productName = existingProduct.name;
      const updates = {};
      let skip = false;

      if (enabled.has("name")) {
        const val = String(cellByHeader(row, "name") || "").trim();
        if (val) updates.name = val;
      }

      if (enabled.has("latinName")) {
        const val = String(cellByHeader(row, "latinName") || "").trim();
        if (val) updates.latin_name = val;
      }

      if (enabled.has("code")) {
        const val = String(cellByHeader(row, "code") || "").trim();
        if (val && val !== existingProduct.code) {
          if (existingCodes.has(val)) {
            const reason = "productCodeExists";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            skip = true;
          } else {
            updates.code = val;
          }
        }
      }
      if (skip) continue;

      if (enabled.has("costPrice")) {
        const cell = parseNumberCell(cellByHeader(row, "costPrice"));
        if (!cell.valid) {
          const reason = "invalidCostPrice";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, productName, reason],
          );
          continue;
        }
        if (!cell.blank) updates.cost_price = cell.value;
      }

      if (enabled.has("description")) {
        const val = String(cellByHeader(row, "description") || "").trim();
        if (val) updates.description = val;
      }

      let taxId;
      if (enabled.has("tax")) {
        const taxLabel = stripTaxLabel(cellByHeader(row, "tax"));
        if (taxLabel) {
          const matchedTaxId = taxByName.get(taxLabel);
          if (!matchedTaxId) {
            const reason = "taxNotFound";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            continue;
          }
          taxId = matchedTaxId;
        }
      }

      let baseUnitPrice;
      if (enabled.has("baseUnit")) {
        const unitCode = String(cellByHeader(row, "unit_code") || "").trim();

        if (unitCode) {
          const matchedUnit = unitByCode.get(unitCode);
          if (!matchedUnit) {
            const reason = "unitCodeNotFound";
            skippedProducts.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            continue;
          }
          updates.unit_id = matchedUnit.id;
        }

        const priceCell = parseNumberCell(cellByHeader(row, "price"));
        if (!priceCell.valid) {
          const reason = "invalidSalePrice";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, productName, reason],
          );
          continue;
        }
        if (!priceCell.blank) baseUnitPrice = priceCell.value;
      }

      let quantityDelta = null;
      if (enabled.has("quantity") && existingProduct.type !== "service") {
        const qtyCell = parseNumberCell(cellByHeader(row, "quantity"));
        if (!qtyCell.valid) {
          const reason = "invalidQuantity";
          skippedProducts.push({ row: rowNumber, name: productName, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_product',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, productName, reason],
          );
          continue;
        }
        if (
          !qtyCell.blank &&
          qtyCell.value !== Number(existingProduct.quantity)
        ) {
          updates.quantity = qtyCell.value;
          quantityDelta = qtyCell.value - Number(existingProduct.quantity);
        }
      }

      if (Object.keys(updates).length > 0 || taxId !== undefined) {
        const setClauses = [];
        const params = [];
        let idx = 1;

        for (const [col, val] of Object.entries(updates)) {
          setClauses.push(`${col} = $${idx}`);
          params.push(val);
          idx++;
        }
        if (taxId !== undefined) {
          setClauses.push(`tax_id = $${idx}`);
          params.push(taxId);
          idx++;
        }

        if (setClauses.length > 0) {
          params.push(productId);
          await q(
            `UPDATE products SET ${setClauses.join(", ")} WHERE id = $${idx}`,
            params,
          );

          if (updates.code) existingCodes.add(updates.code);
        }
      }

      if (baseUnitPrice !== undefined) {
        await q(
          `UPDATE product_units SET sale_price = $1 WHERE product_id = $2 AND is_base = true`,
          [baseUnitPrice, productId],
        );
      }

      if (quantityDelta !== null && quantityDelta !== 0) {
        const { rows: baseUnitRows } = await q(
          `SELECT unit_name FROM product_units WHERE product_id = $1 AND is_base = true`,
          [productId],
        );
        const baseUnitName = baseUnitRows[0]?.unit_name || "Unit";

        await createProductMovement(q, {
          product_id: productId,
          reference_id: productId,
          reference_type: "adjustment",
          action: "update",
          type: quantityDelta > 0 ? "in" : "out",
          quantity: Math.abs(quantityDelta),
          enterPrice: updates.cost_price ?? existingProduct.cost_price,
          base_unit_name: baseUnitName,
          unit_name: baseUnitName,
          conversion_factor: 1,
        });
      }

      if (enabled.has("barcodes")) {
        const barcodesRaw = String(cellByHeader(row, "barcodes") || "");
        const incomingBarcodes = barcodesRaw
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);

        const { rows: currentBarcodeRows } = await q(
          "SELECT id, barcode FROM product_barcodes WHERE product_id = $1",
          [productId],
        );
        const currentBarcodeSet = new Set(
          currentBarcodeRows.map((b) => b.barcode),
        );
        const incomingSet = new Set(incomingBarcodes);

        for (const existingBarcode of currentBarcodeRows) {
          if (!incomingSet.has(existingBarcode.barcode)) {
            await q("DELETE FROM product_barcodes WHERE id = $1", [
              existingBarcode.id,
            ]);
            existingBarcodes.delete(existingBarcode.barcode);
          }
        }

        for (const barcode of incomingBarcodes) {
          if (currentBarcodeSet.has(barcode)) continue;

          if (existingBarcodes.has(barcode)) {
            const reason = "barcodeAlreadyUsed";
            skippedBarcodes.push({ row: rowNumber, barcode, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_barcode',$3,$4,$5,$6)`,
              [importId, rowNumber, productId, productName, barcode, reason],
            );
            continue;
          }

          await q(
            "INSERT INTO product_barcodes (product_id, barcode) VALUES ($1, $2)",
            [productId, barcode],
          );
          existingBarcodes.add(barcode);
        }
      }

      if (enabled.has("units")) {
        const seenUnitNames = new Set();
        const { rows: baseUnitRows } = await q(
          `SELECT unit_name FROM product_units WHERE product_id = $1 AND is_base = true`,
          [productId],
        );
        if (baseUnitRows[0]) {
          seenUnitNames.add(baseUnitRows[0].unit_name.toLowerCase());
        }

        for (const group of unitGroups) {
          const unitIdRaw = cellByHeader(row, group.idHeader);
          const unitId = unitIdRaw ? Number(unitIdRaw) : null;
          const unitName = String(
            cellByHeader(row, group.nameHeader) || "",
          ).trim();

          if (unitId && !unitName) {
            const { rows: unitRowsToDelete } = await q(
              "SELECT barcode FROM product_units WHERE id = $1",
              [unitId],
            );
            await q("DELETE FROM product_units WHERE id = $1", [unitId]);
            if (unitRowsToDelete[0]?.barcode)
              existingUnitBarcodes.delete(unitRowsToDelete[0].barcode);
            continue;
          }

          if (!unitName) continue;

          if (seenUnitNames.has(unitName.toLowerCase())) {
            const reason = "duplicateUnitName";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            continue;
          }

          const factorCell = parseNumberCell(
            cellByHeader(row, group.factorHeader),
          );
          if (!factorCell.valid || factorCell.blank || factorCell.value <= 1) {
            const reason = "invalidConversionFactor";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            continue;
          }

          const priceCell = parseNumberCell(
            cellByHeader(row, group.priceHeader),
          );
          if (!priceCell.valid) {
            const reason = "invalidUnitPrice";
            skippedUnits.push({ row: rowNumber, name: productName, reason });
            await q(
              `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
               VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
              [importId, rowNumber, productId, productName, reason],
            );
            continue;
          }

          const unitBarcode = String(
            cellByHeader(row, group.barcodeHeader) || "",
          ).trim();

          if (unitId) {
            const { rows: currentUnitRows } = await q(
              "SELECT barcode FROM product_units WHERE id = $1",
              [unitId],
            );
            const currentUnit = currentUnitRows[0];

            if (
              unitBarcode &&
              unitBarcode !== currentUnit?.barcode &&
              existingUnitBarcodes.has(unitBarcode)
            ) {
              const reason = "unitBarcodeAlreadyUsed";
              skippedUnits.push({ row: rowNumber, name: productName, reason });
              await q(
                `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
                 VALUES ($1,$2,'skipped_unit',$3,$4,$5,$6)`,
                [
                  importId,
                  rowNumber,
                  productId,
                  productName,
                  unitBarcode,
                  reason,
                ],
              );
              continue;
            }

            await q(
              `UPDATE product_units
               SET unit_name = $1, conversion_factor = $2, sale_price = $3, barcode = $4
               WHERE id = $5`,
              [
                unitName,
                factorCell.value,
                priceCell.blank ? 0 : priceCell.value,
                unitBarcode || null,
                unitId,
              ],
            );

            if (currentUnit?.barcode)
              existingUnitBarcodes.delete(currentUnit.barcode);
            if (unitBarcode) existingUnitBarcodes.add(unitBarcode);
          } else {
            if (unitBarcode && existingUnitBarcodes.has(unitBarcode)) {
              const reason = "unitBarcodeAlreadyUsed";
              skippedUnits.push({ row: rowNumber, name: productName, reason });
              await q(
                `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
                 VALUES ($1,$2,'skipped_unit',$3,$4,$5,$6)`,
                [
                  importId,
                  rowNumber,
                  productId,
                  productName,
                  unitBarcode,
                  reason,
                ],
              );
              continue;
            }

            await q(
              `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
               VALUES ($1,$2,$3,false,$4,$5)`,
              [
                productId,
                unitName,
                factorCell.value,
                priceCell.blank ? 0 : priceCell.value,
                unitBarcode || null,
              ],
            );

            if (unitBarcode) existingUnitBarcodes.add(unitBarcode);
          }

          seenUnitNames.add(unitName.toLowerCase());
        }
      }

      updated.push({ row: rowNumber, name: productName, id: productId });
    }

    await q(
      `UPDATE product_imports
       SET total_rows = $1, created_count = $2, skipped_products_count = $3, skipped_barcodes_count = $4, skipped_units_count = $5
       WHERE id = $6`,
      [
        totalRows,
        updated.length,
        skippedProducts.length,
        skippedBarcodes.length,
        skippedUnits.length,
        importId,
      ],
    );

    await client.query("COMMIT");

    return {
      importId,
      updated,
      skippedProducts,
      skippedBarcodes,
      skippedUnits,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
