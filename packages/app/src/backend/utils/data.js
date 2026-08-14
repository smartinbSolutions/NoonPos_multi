// packages/app/src/backend/utils/data.js

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

function localize(entry, language) {
  const secondary = language === "en" ? "ar" : "en";
  return [entry[language], entry[secondary]];
}

/**
 * TEMPORARY: inlined equivalent of createProductMovement (products module,
 * not yet ported). Duplicates that function's insert logic just for the
 * two sample products seeded here. Once products/createProductMovement.js
 * is ported, replace this with a real call to it and delete this helper.
 */
async function insertSeedProductMovement(query, movement) {
  await query(
    `
    INSERT INTO product_movements (
      product_id, reference_id, reference_type, type, action,
      enter_price, out_price, quantity, base_unit_name, unit_name,
      conversion_factor
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      movement.product_id,
      movement.reference_id,
      movement.reference_type,
      movement.type,
      movement.action,
      movement.enter_price ?? 0,
      movement.out_price ?? 0,
      movement.quantity,
      movement.base_unit_name,
      movement.unit_name,
      movement.conversion_factor,
    ]
  );
}

/**
 * PORTED: async, Postgres. Called once ever per shop, inside the same
 * transaction as create-company-settings — see companySettings.js.
 * `query` here is actually the transaction client's .query, not the
 * shared pool, so all inserts are part of the caller's transaction.
 */
export async function seedData(query, { language = "ar", currencyId } = {}) {
  const lang = ["ar", "en", "tr"].includes(language) ? language : "ar";

  let resolvedCurrencyId = currencyId;
  if (!resolvedCurrencyId) {
    const { rows } = await query(
      "SELECT id FROM currencies WHERE is_primary = true LIMIT 1"
    );
    resolvedCurrencyId = rows[0]?.id ?? 1;
  }

  for (const unit of TRANSLATIONS.units) {
    const [name, latinName] = localize(unit, lang);
    await query(
      `INSERT INTO unit (name, latin_name, code)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [name, latinName, unit.code]
    );
  }

  for (const tax of TRANSLATIONS.taxes) {
    const name = tax[lang] || tax.en;
    await query(
      `INSERT INTO taxes (name, rate, category)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [name, tax.rate, tax.category]
    );
  }

  // funds/expense_category have no unique constraint to conflict on, and
  // seedData only ever runs once per shop (gated by company_settings
  // being empty) — a plain insert is correct here, no ON CONFLICT needed.
  await query(`INSERT INTO funds (name, currency_id) VALUES ($1, $2)`, [
    TRANSLATIONS.fundName[lang],
    resolvedCurrencyId,
  ]);

  for (const category of TRANSLATIONS.expenseCategories) {
    const [name, latinName] = localize(category, lang);
    await query(
      `INSERT INTO expense_category (name, latin_name) VALUES ($1, $2)`,
      [name, latinName]
    );
  }

  // ---- Sample product ----------------------------------------------------
  const pieceUnitResult = await query(
    "SELECT id, name FROM unit WHERE code = $1",
    ["PCS"]
  );
  const pieceUnit = pieceUnitResult.rows[0];

  if (pieceUnit) {
    const [name, latinName] = localize(TRANSLATIONS.testProduct, lang);
    const costPrice = 50;
    const salePrice = 100;
    const quantity = 10;

    const productResult = await query(
      `INSERT INTO products (name, latin_name, cost_price, quantity, unit_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name, latinName, costPrice, quantity, pieceUnit.id]
    );
    const productId = productResult.rows[0].id;

    await query(
      `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
       VALUES ($1, $2, 1, true, $3)`,
      [productId, pieceUnit.name || "Piece", salePrice]
    );

    await insertSeedProductMovement(query, {
      product_id: productId,
      reference_id: productId,
      reference_type: "initial",
      action: "create",
      type: "in",
      quantity,
      enter_price: costPrice,
      base_unit_name: pieceUnit.name || "Piece",
      unit_name: pieceUnit.name || "Piece",
      conversion_factor: 1,
    });
  }

  // ---- Sample service product ---------------------------------------------
  const serviceUnitResult = await query(
    "SELECT id, name FROM unit WHERE code = $1",
    ["SRV"]
  );
  const serviceUnit = serviceUnitResult.rows[0];

  if (serviceUnit) {
    const [name, latinName] = localize(TRANSLATIONS.testServiceProduct, lang);
    const costPrice = 0;
    const salePrice = 75;
    const quantity = 0;

    const productResult = await query(
      `INSERT INTO products (name, latin_name, cost_price, quantity, unit_id, type)
       VALUES ($1, $2, $3, $4, $5, 'service')
       RETURNING id`,
      [name, latinName, costPrice, quantity, serviceUnit.id]
    );
    const productId = productResult.rows[0].id;

    await query(
      `INSERT INTO product_units (product_id, unit_name, conversion_factor, is_base, sale_price)
       VALUES ($1, $2, 1, true, $3)`,
      [productId, serviceUnit.name || "Service", salePrice]
    );

    await insertSeedProductMovement(query, {
      product_id: productId,
      reference_id: productId,
      reference_type: "initial",
      action: "create",
      type: "in",
      quantity,
      enter_price: costPrice,
      base_unit_name: serviceUnit.name || "Service",
      unit_name: serviceUnit.name || "Service",
      conversion_factor: 1,
    });
  }
}