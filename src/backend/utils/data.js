import createProductMovement from "./createPorductMovment";

const TRANSLATIONS = {
  units: [
    { en: "Piece", ar: "قطعة", tr: "Adet", code: "PCS" },
    { en: "Kilogram", ar: "كيلوغرام", tr: "Kilogram", code: "KG" },
    { en: "Gram", ar: "غرام", tr: "Gram", code: "G" },
    { en: "Liter", ar: "لتر", tr: "Litre", code: "L" },
    { en: "Meter", ar: "متر", tr: "Metre", code: "M" },
    { en: "Box", ar: "علبة", tr: "Kutu", code: "BOX" },
    { en: "Carton", ar: "كرتون", tr: "Karton", code: "CTN" },
    { en: "Set", ar: "طقم", tr: "Set", code: "SET" },
    { en: "Service", ar: "خدمة", tr: "Hizmet", code: "SRV" },
  ],
  taxes: [
    // Product-level: applied per line item (e.g. VAT on a specific product)
    {
      en: "Standard VAT 18%",
      ar: "ضريبة القيمة المضافة القياسية 18%",
      tr: "Standart KDV %18",
      rate: 18,
      category: "product",
    },
    {
      en: "Reduced VAT 5%",
      ar: "ضريبة القيمة المضافة المخفضة 5%",
      tr: "İndirimli KDV %5",
      rate: 5,
      category: "product",
    },
    {
      en: "Zero-Rated VAT 0%",
      ar: "ضريبة القيمة المضافة الصفرية 0%",
      tr: "Sıfır Oranlı KDV %0",
      rate: 0,
      category: "product",
    },

    // Invoice-level: applied once to the whole invoice (service/delivery style charges)
    {
      en: "Service Charge 5%",
      ar: "رسوم الخدمة 5%",
      tr: "Hizmet Bedeli %5",
      rate: 5,
      category: "invoice",
    },
    {
      en: "Delivery Tax 2%",
      ar: "ضريبة التوصيل 2%",
      tr: "Teslimat Vergisi %2",
      rate: 2,
      category: "invoice",
    },
    {
      en: "Stamp Duty 1%",
      ar: "رسم الدمغة 1%",
      tr: "Damga Vergisi %1",
      rate: 1,
      category: "invoice",
    },

    // Both: usable at either the product line or the invoice header
    {
      en: "General VAT 10%",
      ar: "ضريبة القيمة المضافة العامة 10%",
      tr: "Genel KDV %10",
      rate: 10,
      category: "both",
    },
    {
      en: "Municipal Tax 3%",
      ar: "الضريبة البلدية 3%",
      tr: "Belediye Vergisi %3",
      rate: 3,
      category: "both",
    },
    {
      en: "Excise Tax 20%",
      ar: "ضريبة الإنتاج 20%",
      tr: "Özel Tüketim Vergisi %20",
      rate: 20,
      category: "both",
    },
  ],
  expenseCategories: [
    { en: "Employee Salaries", ar: "مرتبات الموظفين", tr: "Personel Maaşları" },
    { en: "Services", ar: "خدمات", tr: "Hizmetler" },
    {
      en: "Administrative Expenses",
      ar: "مصاريف إدارية",
      tr: "İdari Giderler",
    },
    { en: "Sales Expenses", ar: "مصاريف مبيعات", tr: "Satış Giderleri" },
  ],
  fundName: { en: "Main Fund", ar: "الصندوق الرئيسي", tr: "Ana Kasa" },
  testProduct: { en: "Sample Product", ar: "منتج تجريبي", tr: "Örnek Ürün" },
  testServiceProduct: {
    en: "Sample Service",
    ar: "خدمة تجريبية",
    tr: "Örnek Hizmet",
  },
};

// name = chosen setup language, latinName = secondary reference language
// (mirrors the original en/ar pairing, just made direction-aware)
function localize(entry, language) {
  const secondary = language === "en" ? "ar" : "en";
  return [entry[language], entry[secondary]];
}

export function seedData(db, { language = "ar", currencyId } = {}) {
  const lang = ["ar", "en", "tr"].includes(language) ? language : "ar";

  // Resolve the fund's currency: prefer the id we were just given,
  // fall back to whichever currency is flagged primary.
  const resolvedCurrencyId =
    currencyId ??
    db.prepare(`SELECT id FROM currencies WHERE isPrimary = 1 LIMIT 1`).get()
      ?.id ??
    1;

  const insertUnit = db.prepare(`
    INSERT OR IGNORE INTO unit(name, latinName, code)
    VALUES (?, ?, ?)
  `);

  TRANSLATIONS.units.forEach((unit) => {
    const [name, latinName] = localize(unit, lang);
    insertUnit.run(name, latinName, unit.code);
  });

  const insertTax = db.prepare(`
    INSERT OR IGNORE INTO taxes(name, rate, category)
    VALUES (?, ?, ?)
  `);

  TRANSLATIONS.taxes.forEach((tax) => {
    const name = tax[lang] || tax.en;
    insertTax.run(name, tax.rate, tax.category);
  });

  const insertFund = db.prepare(`
    INSERT OR IGNORE INTO funds(name, currency_id)
    VALUES (?, ?)
  `);
  insertFund.run(TRANSLATIONS.fundName[lang], resolvedCurrencyId);

  const insertExpenseCategory = db.prepare(`
    INSERT OR IGNORE INTO expence_category(name, latinName)
    VALUES (?, ?)
  `);

  TRANSLATIONS.expenseCategories.forEach((category) => {
    const [name, latinName] = localize(category, lang);
    insertExpenseCategory.run(name, latinName);
  });

  // Sample product for testing, using the "Piece" unit seeded above
  const pieceUnitCode = "PCS";
  const pieceUnit = db
    .prepare(`SELECT id, name FROM unit WHERE code = ?`)
    .get(pieceUnitCode);

  const existingTestProduct = db
    .prepare(`SELECT id FROM products WHERE name = ? LIMIT 1`)
    .get(TRANSLATIONS.testProduct[lang]);

  if (!existingTestProduct && pieceUnit) {
    const [name, latinName] = localize(TRANSLATIONS.testProduct, lang);
    const costPrice = 50;
    const salePrice = 100;
    const quantity = 10;

    const result = db
      .prepare(
        `
        INSERT INTO products (name, latinName, costPrice, quantity, unit_id)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(name, latinName, costPrice, quantity, pieceUnit.id);

    const productId = result.lastInsertRowid;

    db.prepare(
      `
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
        VALUES (?, ?, 1, 1, ?)
      `
    ).run(productId, pieceUnit.name || "Piece", salePrice);

    createProductMovement(db, {
      product_id: productId,
      reference_id: productId,
      reference_type: "initial",
      action: "create",
      type: "in",
      quantity,
      enterPrice: costPrice,
      base_unit_name: pieceUnit.name || "Piece",
      unit_name: pieceUnit.name || "Piece",
      conversion_factor: 1,
    });
  }

  // Sample service product — same shape as the sample piece product above,
  // just type: 'service' and the "Service" unit. quantity/costPrice stay 0
  // since there's no real stock behind a service; createProductMovement
  // still fires for consistency with create-product's handling (movement
  // history exists for every product regardless of type), it's just a 0-in
  // entry rather than a meaningful stock event.
  const serviceUnitCode = "SRV";
  const serviceUnit = db
    .prepare(`SELECT id, name FROM unit WHERE code = ?`)
    .get(serviceUnitCode);

  const existingTestServiceProduct = db
    .prepare(`SELECT id FROM products WHERE name = ? LIMIT 1`)
    .get(TRANSLATIONS.testServiceProduct[lang]);

  if (!existingTestServiceProduct && serviceUnit) {
    const [name, latinName] = localize(TRANSLATIONS.testServiceProduct, lang);
    const costPrice = 0;
    const salePrice = 75;
    const quantity = 0;

    const result = db
      .prepare(
        `
        INSERT INTO products (name, latinName, costPrice, quantity, unit_id, type)
        VALUES (?, ?, ?, ?, ?, 'service')
      `
      )
      .run(name, latinName, costPrice, quantity, serviceUnit.id);

    const productId = result.lastInsertRowid;

    db.prepare(
      `
        INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
        VALUES (?, ?, 1, 1, ?)
      `
    ).run(productId, serviceUnit.name || "Service", salePrice);

    createProductMovement(db, {
      product_id: productId,
      reference_id: productId,
      reference_type: "initial",
      action: "create",
      type: "in",
      quantity,
      enterPrice: costPrice,
      base_unit_name: serviceUnit.name || "Service",
      unit_name: serviceUnit.name || "Service",
      conversion_factor: 1,
    });
  }
}
