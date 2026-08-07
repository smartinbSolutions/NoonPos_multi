const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const Database = require("better-sqlite3");

const userDataPath = app.getPath("userData");
fs.mkdirSync(userDataPath, { recursive: true });

const dbPath = path.join(userDataPath, "pos.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.prepare(
  `CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','pos')),
  full_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS security_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    recovery_key_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS pin_reset_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    performed_at TEXT NOT NULL DEFAULT (datetime('now')),
    administrator_id INTEGER,
    target_user_id INTEGER,
    device TEXT,
    reset_type TEXT NOT NULL CHECK(reset_type IN ('admin_reset','recovery_key')),
    FOREIGN KEY (administrator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
  );`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS unit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  latinName TEXT,
  code TEXT UNIQUE
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  latinName TEXT,
  code TEXT,
  description TEXT,
  costPrice REAL DEFAULT 0,
  quantity REAL DEFAULT 0,
  logo TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  unit_id INTEGER,
  tax_id INTEGER,
  type TEXT NOT NULL DEFAULT 'normal' CHECK(type IN ('normal', 'service')),
  FOREIGN KEY (unit_id) REFERENCES unit(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS product_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor REAL NOT NULL DEFAULT 1,
  is_base INTEGER NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  barcode TEXT UNIQUE,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS product_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  reference_id INTEGER,
  reference_type TEXT NOT NULL CHECK (
    reference_type IN (
      'purchase',
      'purchase_return',
      'sale',
      'sale_return',
      'initial',
      'import',
      'adjustment'
    )
  ),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  action TEXT NOT NULL,
  enterPrice REAL DEFAULT 0,
  outPrice REAL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  base_unit_name TEXT,
  unit_name TEXT,
  conversion_factor REAL DEFAULT 1,
  date TEXT DEFAULT (datetime('now')),
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
)
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  barcode TEXT UNIQUE,
  FOREIGN KEY (product_id) REFERENCES products(id)
)
  `
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS product_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  skipped_products_count INTEGER DEFAULT 0,
  skipped_barcodes_count INTEGER DEFAULT 0,
  skipped_invalid_count INTEGER DEFAULT 0,
  skipped_units_count INTEGER DEFAULT 0,
  report_path TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS product_import_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  row_number INTEGER,
  status TEXT NOT NULL,       -- 'created' | 'skipped_product' | 'skipped_barcode' | 'skipped_invalid' | 'skipped_unit'
  product_id INTEGER,
  product_name TEXT,
  barcode TEXT,
  reason TEXT,
  FOREIGN KEY (import_id) REFERENCES product_imports(id),
   FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  address TEXT,

  createdAt TEXT DEFAULT (datetime('now'))
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  address TEXT,

  createdAt TEXT DEFAULT (datetime('now'))
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  address TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  latinName TEXT,
  minorName TEXT,
  minorLatinName TEXT,
  code TEXT UNIQUE,
  exchangeRate REAL DEFAULT 1,
  symbol TEXT,
  isPrimary INTEGER DEFAULT 0
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  currency_id INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (currency_id) REFERENCES currencies(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  rate REAL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'product' CHECK (category IN ('product', 'invoice', 'both'))
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_name TEXT,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'manual' CHECK(channel IN ('manual', 'pos')),
  date TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  description TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  net_total REAL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_invoice_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  buyingPrice REAL DEFAULT 0,
  total REAL NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor REAL DEFAULT 1,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  description TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_invoice_id INTEGER,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'manual' CHECK(channel IN ('manual', 'pos')),
  invoice_name TEXT,
  description TEXT,
  date TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  net_total REAL DEFAULT 0,
  created_by INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sales_invoice_id)
    REFERENCES sales_invoices(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (customer_id)
    REFERENCES customers(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_return_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (return_id) REFERENCES sales_returns(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_invoice_item_id INTEGER NOT NULL,
  return_id INTEGER,
  product_id INTEGER,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor REAL DEFAULT 1,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  description TEXT,
  FOREIGN KEY (sales_invoice_item_id)
    REFERENCES sales_invoice_items(id),
  FOREIGN KEY (return_id)
    REFERENCES sales_returns(id)
    ON DELETE CASCADE,
  FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (tax_id)
    REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_name TEXT,
  customer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  date TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  description TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  net_total REAL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_quotation_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS sales_quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL,
  product_id INTEGER,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor REAL DEFAULT 1,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  description TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_name TEXT,
  description TEXT,
  supplier_id INTEGER,
  date TEXT,
  subtotal REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  net_total REAL DEFAULT 0, 
  created_by INTEGER,
  updated_by INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_invoice_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor REAL DEFAULT 1,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  description TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id)
    REFERENCES purchase_invoices(id)
    ON DELETE CASCADE,

  FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT,

  FOREIGN KEY (tax_id)
    REFERENCES taxes(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_id INTEGER,
  supplier_id INTEGER,
  invoice_name TEXT,
  description TEXT,
  date TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  net_total REAL DEFAULT 0,
  created_by INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_invoice_id)
    REFERENCES purchase_invoices(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_return_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_invoice_item_id INTEGER NOT NULL,
  return_id INTEGER,
  product_id INTEGER,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor REAL DEFAULT 1,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  description TEXT,
  FOREIGN KEY (purchase_invoice_item_id)
    REFERENCES purchase_invoice_items(id),
  FOREIGN KEY (return_id)
    REFERENCES purchase_returns(id)
    ON DELETE CASCADE,
  FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (tax_id)
    REFERENCES taxes(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS expence_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  latinName TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS expense (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER,
  invoice_name TEXT,
  description TEXT,
  date TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  net_total REAL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS expense_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER,
  category_id INTEGER,
  price REAL,
  total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  tax_id INTEGER,
  tax_rate REAL DEFAULT 0,
  taxValue REAL DEFAULT 0,
  description TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (expense_id) REFERENCES expense(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS expense_taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_value REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (expense_id) REFERENCES expense(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT, -- income / expense
  party_type TEXT, -- customer / supplier / other
  party_id INTEGER,
  fund_id INTEGER,
  amount REAL, -- 
  currency_code TEXT, -- USD / TRY / EUR
  exchange_rate REAL, -- Exchange rate at time of payment
  effective_rate REAL, -- Effective rate at time of payment
  amount_fund_currency REAL, 
  note TEXT,
  date TEXT,
  created_by INTEGER,
  invoice_type TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (fund_id) REFERENCES funds(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    invoice_type TEXT NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id)
);
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS deleted_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  payload TEXT NOT NULL, -- JSON snapshot of { payment, allocations } at time of deletion
  deleted_by INTEGER,
  deletedAt TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
)
`
).run();

db.prepare(
  `
CREATE TABLE IF NOT EXISTS party_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_type TEXT NOT NULL CHECK(party_type IN ('customer','supplier','partner')),
  party_id INTEGER,
  record_type TEXT NOT NULL CHECK(record_type IN ('opening_balance','invoice','return','payment')),
  invoice_id INTEGER,
  invoice_type TEXT NOT NULL CHECK(invoice_type IN ('opening_balance','expense','purchase','purchase_return','sales','sales_return','payment')),
  payment_id INTEGER,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('increase','decrease')),
  amount REAL,
  date TEXT,
  note TEXT,
  createdAt TEXT DEFAULT (datetime('now'))
  
)
`
).run();
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS fund_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER,
    record_type TEXT NOT NULL CHECK(record_type IN ('payment', 'transfer' , 'opening_balance')),   
    payment_id INTEGER,
    date TEXT,
    movement_type TEXT,   
    amount REAL,
    note TEXT,
    created_by INTEGER,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS fund_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fund_id INTEGER,
    to_fund_id INTEGER,
    deduct_amount REAL,
    receive_amount REAL,
    exchange_rate REAL,
    effective_rate REAL,
    note TEXT,
    date TEXT,
    created_by INTEGER,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL

  );
  `
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    company_latin_name TEXT,
    country TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    email TEXT,
    logo TEXT,
    base_currency_id INTEGER,
    language TEXT DEFAULT 'ar',
    timezone TEXT DEFAULT 'Asia/Damascus',
    allow_negative_stock INTEGER DEFAULT 0,
    minimum_stock REAL DEFAULT 0,
    pos_invoice_tax_mode TEXT DEFAULT 'manual' CHECK(pos_invoice_tax_mode IN ('manual', 'fixed')),
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (base_currency_id) REFERENCES currencies(id)
  )`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS company_default_pos_taxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_id INTEGER NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (tax_id) REFERENCES taxes(id)
  )`
).run();

db.prepare(
  `CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales_invoice_items(invoice_id)`
).run();
db.prepare(
  `CREATE INDEX IF NOT EXISTS idx_purchase_invoice ON purchase_invoice_items(invoice_id)`
).run();

export default db;
