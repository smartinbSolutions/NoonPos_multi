// packages/app/src/backend/utils/productImport.js
import ExcelJS from "exceljs";
import createProductMovement from "./createPorductMovment";

export async function generateProductImportTemplate(query) {
  const { rows: unitRows } = await query(
    "SELECT code FROM unit WHERE code IS NOT NULL",
  );
  const units = unitRows.map((u) => u.code);

  const { rows: taxRows } = await query(
    `SELECT name, rate FROM taxes
     WHERE category IN ('product', 'both') AND name IS NOT NULL
     ORDER BY name`,
  );
  const taxLabels = taxRows.map((t) => `${t.name} (${t.rate}%)`);

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

export async function parseProductImport(getClient, filePath, fileName) {
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

    const { rows: barcodeRows } = await q(
      "SELECT barcode FROM product_barcodes",
    );
    const existingBarcodes = new Set(barcodeRows.map((b) => b.barcode));

    const { rows: unitBarcodeRows } = await q(
      "SELECT barcode FROM product_units WHERE barcode IS NOT NULL",
    );
    const existingUnitBarcodes = new Set(unitBarcodeRows.map((u) => u.barcode));

    const { rows: codeRows } = await q(
      "SELECT code FROM products WHERE code IS NOT NULL",
    );
    const existingCodes = new Set(codeRows.map((p) => p.code));

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
      const name = String(cellByHeader(row, "name") || "").trim();
      if (!name) continue;

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
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
            [importId, rowNumber, name, reason],
          );
          continue;
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
        await q(
          `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
           VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
          [importId, rowNumber, name, reason],
        );
        continue;
      }

      const costPrice = costPriceCell.value;
      const price = priceCell.value;
      const quantity = isService ? 0 : quantityCell.value;

      const { rows: nameMatch } = await q(
        "SELECT id FROM products WHERE name = $1",
        [name],
      );
      if (nameMatch[0]) {
        const reason = "productNameExists";
        skippedProducts.push({ row: rowNumber, name, reason });
        await q(
          `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
           VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
          [importId, rowNumber, name, reason],
        );
        continue;
      }

      if (code && existingCodes.has(code)) {
        const reason = "productCodeExists";
        skippedProducts.push({ row: rowNumber, name, reason });
        await q(
          `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
           VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
          [importId, rowNumber, name, reason],
        );
        continue;
      }

      const matchedUnit = unitByCode.get(unitCode) || null;
      if (!matchedUnit) {
        const reason = unitCode ? "unitCodeNotFound" : "unitCodeRequired";
        skippedProducts.push({ row: rowNumber, name, reason });
        await q(
          `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
           VALUES ($1,$2,'skipped_product',NULL,$3,NULL,$4)`,
          [importId, rowNumber, name, reason],
        );
        continue;
      }

      const unitId = matchedUnit.id;
      const baseUnitName = matchedUnit.name || "Unit";
      const taxId = taxName ? taxByName.get(taxName) || null : null;

      const productResult = await q(
        `INSERT INTO products (name, latin_name, code, cost_price, quantity, unit_id, tax_id, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          name,
          latinName,
          code || null,
          costPrice,
          quantity,
          unitId,
          taxId,
          type,
        ],
      );
      const productId = productResult.rows[0].id;

      if (code) existingCodes.add(code);

      await q(
        `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
         VALUES ($1,$2,1,true,$3)`,
        [productId, baseUnitName, price],
      );

      const seenUnitNames = new Set([baseUnitName.toLowerCase()]);

      const barcodes = barcodesRaw
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      for (const barcode of barcodes) {
        if (existingBarcodes.has(barcode)) {
          const reason = "barcodeAlreadyUsed";
          skippedBarcodes.push({ row: rowNumber, barcode, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_barcode',$3,$4,$5,$6)`,
            [importId, rowNumber, productId, name, barcode, reason],
          );
          continue;
        }
        await q(
          "INSERT INTO product_barcodes (product_id, barcode) VALUES ($1, $2)",
          [productId, barcode],
        );
        existingBarcodes.add(barcode);
      }

      for (const group of additionalUnitGroups) {
        const unitName = String(
          cellByHeader(row, group.nameHeader) || "",
        ).trim();
        if (!unitName) continue;

        const factorCell = parseNumberCell(
          cellByHeader(row, group.factorHeader),
        );
        const unitPriceCell = parseNumberCell(
          cellByHeader(row, group.priceHeader),
        );
        const unitBarcode = String(
          cellByHeader(row, group.barcodeHeader) || "",
        ).trim();

        if (seenUnitNames.has(unitName.toLowerCase())) {
          const reason = "duplicateUnitName";
          skippedUnits.push({ row: rowNumber, name, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, name, reason],
          );
          continue;
        }

        if (!factorCell.valid || factorCell.value <= 1) {
          const reason = "invalidConversionFactor";
          skippedUnits.push({ row: rowNumber, name, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, name, reason],
          );
          continue;
        }

        if (!unitPriceCell.valid) {
          const reason = "invalidUnitPrice";
          skippedUnits.push({ row: rowNumber, name, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_unit',$3,$4,NULL,$5)`,
            [importId, rowNumber, productId, name, reason],
          );
          continue;
        }

        if (unitBarcode && existingUnitBarcodes.has(unitBarcode)) {
          const reason = "unitBarcodeAlreadyUsed";
          skippedUnits.push({ row: rowNumber, name, reason });
          await q(
            `INSERT INTO product_import_items (import_id, row_number, status, product_id, product_name, barcode, reason)
             VALUES ($1,$2,'skipped_unit',$3,$4,$5,$6)`,
            [importId, rowNumber, productId, name, unitBarcode, reason],
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
            unitPriceCell.value,
            unitBarcode || null,
          ],
        );

        seenUnitNames.add(unitName.toLowerCase());
        if (unitBarcode) existingUnitBarcodes.add(unitBarcode);
      }

      await createProductMovement(q, {
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
    }

    await q(
      `UPDATE product_imports
       SET total_rows = $1, created_count = $2, skipped_products_count = $3, skipped_barcodes_count = $4, skipped_units_count = $5
       WHERE id = $6`,
      [
        totalRows,
        created.length,
        skippedProducts.length,
        skippedBarcodes.length,
        skippedUnits.length,
        importId,
      ],
    );

    await client.query("COMMIT");

    return {
      importId,
      created,
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
