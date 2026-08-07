import ExcelJS from "exceljs";
import createProductMovement from "./createPorductMovment";

export async function generateProductImportTemplate(db) {
  const units = db
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
  const taxLabels = taxRows.map((t) => `${t.name} (${t.rate}%)`);

  // Raw type codes, not translated labels — same convention unit_code
  // already uses (the code itself in the dropdown, not a display name).
  const typeCodes = ["normal", "service"];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");

  const unitsSheet = workbook.addWorksheet("Units");
  unitsSheet.state = "veryHidden";

  const taxesSheet = workbook.addWorksheet("Taxes");
  taxesSheet.state = "veryHidden";

  const typesSheet = workbook.addWorksheet("Types");
  typesSheet.state = "veryHidden";

  units.forEach((code, i) => {
    unitsSheet.getCell(`A${i + 1}`).value = code;
  });

  taxLabels.forEach((label, i) => {
    taxesSheet.getCell(`A${i + 1}`).value = label;
  });

  typeCodes.forEach((code, i) => {
    typesSheet.getCell(`A${i + 1}`).value = code;
  });

  sheet.columns = [
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
    { header: "barcodes", key: "barcodes", width: 32 },
    { header: "unit2_name", key: "unit2_name", width: 18 },
    {
      header: "unit2_conversion_factor",
      key: "unit2_conversion_factor",
      width: 20,
      style: { numFmt: "@" },
    },
    {
      header: "unit2_price",
      key: "unit2_price",
      width: 14,
      style: { numFmt: "@" },
    },
    { header: "unit2_barcode", key: "unit2_barcode", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  // One optional additional-selling-unit slot is pre-built here
  // (unit2_*). More can be added by copying that same 4-column group
  // rightward as unit3_*, unit4_*, etc. — the importer discovers any
  // "unitN_name" header dynamically rather than expecting a fixed count.
  sheet.getCell("K1").note = {
    texts: [
      {
        text: "Optional. To add another selling unit beyond this one, copy these 4 columns (name/conversion_factor/price/barcode) and rename them unit3_*, unit4_*, and so on.",
      },
    ],
  };

  if (units.length > 0) {
    const ref = `Units!$A$1:$A$${units.length}`;
    for (let row = 2; row <= 500; row++) {
      sheet.getCell(`E${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
      };
    }
  }

  if (taxLabels.length > 0) {
    const ref = `Taxes!$A$1:$A$${taxLabels.length}`;
    for (let row = 2; row <= 500; row++) {
      sheet.getCell(`H${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
      };
    }
  }

  {
    const ref = `Types!$A$1:$A$${typeCodes.length}`;
    for (let row = 2; row <= 500; row++) {
      sheet.getCell(`D${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
      };
    }
  }

  return workbook.xlsx.writeBuffer();
}

export async function parseProductImport(db, filePath, fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

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

  const insertProduct = db.prepare(`
        INSERT INTO products (name, latinName, code, costPrice, quantity, unit_id, tax_id, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
  const insertBaseProductUnit = db.prepare(`
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
        VALUES (?, ?, 1, 1, ?)
      `);
  const insertAdditionalProductUnit = db.prepare(`
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price, barcode)
        VALUES (?, ?, ?, 0, ?, ?)
      `);
  const insertBarcode = db.prepare(`
        INSERT INTO product_barcodes (product_id, barcode) VALUES (?, ?)
      `);
  const getProductByName = db.prepare(`SELECT id FROM products WHERE name = ?`);

  const existingCodes = new Set(
    db
      .prepare(`SELECT code FROM products WHERE code IS NOT NULL`)
      .all()
      .map((p) => p.code)
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

  const created = [];
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
      return { value: 0, valid: true };
    }

    if (raw instanceof Date) {
      return { value: null, valid: false };
    }

    const normalized =
      typeof raw === "string" ? raw.trim().replace(",", ".") : raw;

    const n = Number(normalized);

    if (!Number.isFinite(n)) {
      return { value: null, valid: false };
    }

    return { value: n, valid: true };
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
  const additionalUnitGroups = Object.keys(headerMap)
    .map((header) => header.match(unitGroupPattern))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
    .map((n) => ({
      n,
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

      const name = String(cellByHeader(row, "name") || "").trim();
      if (!name) return;

      totalRows++;

      const latinName = String(cellByHeader(row, "latinName") || "").trim();
      const code = String(cellByHeader(row, "code") || "").trim();
      const unitCode = String(cellByHeader(row, "unit_code") || "").trim();
      const taxName = stripTaxLabel(cellByHeader(row, "tax"));
      const barcodesRaw = String(cellByHeader(row, "barcodes") || "");

      const rawType = String(cellByHeader(row, "type") || "")
        .trim()
        .toLowerCase();

      let type = "normal";
      if (rawType) {
        if (rawType !== "normal" && rawType !== "service") {
          const reason = "invalidType";
          skippedProducts.push({ row: rowNumber, name, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_product",
            null,
            name,
            null,
            reason
          );
          return;
        }
        type = rawType;
      }

      const isService = type === "service";

      const costPriceCell = parseNumberCell(cellByHeader(row, "costPrice"));
      const priceCell = parseNumberCell(cellByHeader(row, "price"));
      const quantityCell = parseNumberCell(cellByHeader(row, "quantity"));

      if (!costPriceCell.valid || !priceCell.valid || !quantityCell.valid) {
        const reason = !costPriceCell.valid
          ? "invalidCostPrice"
          : !priceCell.valid
            ? "invalidSalePrice"
            : "invalidQuantity";
        skippedProducts.push({ row: rowNumber, name, reason });
        insertImportItem.run(
          importId,
          rowNumber,
          "skipped_product",
          null,
          name,
          null,
          reason
        );
        return;
      }

      const costPrice = costPriceCell.value;
      const price = priceCell.value;
      const quantity = isService ? 0 : quantityCell.value;

      if (getProductByName.get(name)) {
        const reason = "productNameExists";
        skippedProducts.push({ row: rowNumber, name, reason });
        insertImportItem.run(
          importId,
          rowNumber,
          "skipped_product",
          null,
          name,
          null,
          reason
        );
        return;
      }

      if (code && existingCodes.has(code)) {
        const reason = "productCodeExists";
        skippedProducts.push({ row: rowNumber, name, reason });
        insertImportItem.run(
          importId,
          rowNumber,
          "skipped_product",
          null,
          name,
          null,
          reason
        );
        return;
      }

      const matchedUnit = unitByCode.get(unitCode) || null;
      if (!matchedUnit) {
        const reason = unitCode ? "unitCodeNotFound" : "unitCodeRequired";
        skippedProducts.push({ row: rowNumber, name, reason });
        insertImportItem.run(
          importId,
          rowNumber,
          "skipped_product",
          null,
          name,
          null,
          reason
        );
        return;
      }

      const unitId = matchedUnit.id;
      const baseUnitName = matchedUnit.name || "Unit";

      const taxId = taxName ? taxByName.get(taxName) || null : null;

      const result = insertProduct.run(
        name,
        latinName,
        code || null,
        costPrice,
        quantity,
        unitId,
        taxId,
        type
      );
      const productId = result.lastInsertRowid;

      if (code) {
        existingCodes.add(code);
      }

      insertBaseProductUnit.run(productId, baseUnitName, price);

      const seenUnitNames = new Set([baseUnitName.toLowerCase()]);

      const barcodes = barcodesRaw
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      for (const barcode of barcodes) {
        if (existingBarcodes.has(barcode)) {
          const reason = "barcodeAlreadyUsed";
          skippedBarcodes.push({ row: rowNumber, barcode, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_barcode",
            productId,
            name,
            barcode,
            reason
          );
          continue;
        }
        insertBarcode.run(productId, barcode);
        existingBarcodes.add(barcode);
      }

      for (const group of additionalUnitGroups) {
        const unitName = String(
          cellByHeader(row, group.nameHeader) || ""
        ).trim();
        if (!unitName) continue;

        const factorCell = parseNumberCell(
          cellByHeader(row, group.factorHeader)
        );
        const unitPriceCell = parseNumberCell(
          cellByHeader(row, group.priceHeader)
        );
        const unitBarcode = String(
          cellByHeader(row, group.barcodeHeader) || ""
        ).trim();

        if (seenUnitNames.has(unitName.toLowerCase())) {
          const reason = "duplicateUnitName";
          skippedUnits.push({ row: rowNumber, name, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_unit",
            productId,
            name,
            null,
            reason
          );
          continue;
        }

        if (!factorCell.valid || factorCell.value <= 1) {
          const reason = "invalidConversionFactor";
          skippedUnits.push({ row: rowNumber, name, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_unit",
            productId,
            name,
            null,
            reason
          );
          continue;
        }

        if (!unitPriceCell.valid) {
          const reason = "invalidUnitPrice";
          skippedUnits.push({ row: rowNumber, name, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_unit",
            productId,
            name,
            null,
            reason
          );
          continue;
        }

        if (unitBarcode && existingUnitBarcodes.has(unitBarcode)) {
          const reason = "unitBarcodeAlreadyUsed";
          skippedUnits.push({ row: rowNumber, name, reason });
          insertImportItem.run(
            importId,
            rowNumber,
            "skipped_unit",
            productId,
            name,
            unitBarcode,
            reason
          );
          continue;
        }

        insertAdditionalProductUnit.run(
          productId,
          unitName,
          factorCell.value,
          unitPriceCell.value,
          unitBarcode || null
        );

        seenUnitNames.add(unitName.toLowerCase());

        if (unitBarcode) {
          existingUnitBarcodes.add(unitBarcode);
        }
      }

      createProductMovement(db, {
        product_id: productId,
        reference_id: productId,
        reference_type: "import",
        action: "create",
        type: "in",
        quantity,
        enterPrice: costPrice,
        base_unit_name: baseUnitName,
        unit_name: baseUnitName,
        conversion_factor: 1,
      });

      created.push({ row: rowNumber, name, id: productId });
    });

    updateImportCounts.run(
      totalRows,
      created.length,
      skippedProducts.length,
      skippedBarcodes.length,
      skippedUnits.length,
      importId
    );

    return importId;
  });

  const importId = transaction();

  return { importId, created, skippedProducts, skippedBarcodes, skippedUnits };
}
