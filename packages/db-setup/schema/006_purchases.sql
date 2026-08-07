-- packages/db-setup/schema/006_purchases.sql
-- Module 6: Purchases
-- Depends on: suppliers (Module 2), products, taxes (Module 1/3), users (Module 1)

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_name TEXT,
  description TEXT,
  supplier_id INTEGER,
  date TIMESTAMPTZ,
  subtotal NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  net_total NUMERIC DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_invoice_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor NUMERIC DEFAULT 1,
  tax_id INTEGER,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (invoice_id)
    REFERENCES purchase_invoices(id)
    ON DELETE CASCADE,
  FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tax_id)
    REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_invoice_id INTEGER,
  supplier_id INTEGER,
  invoice_name TEXT,
  description TEXT,
  date TIMESTAMPTZ,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  net_total NUMERIC DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS purchase_return_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_invoice_item_id INTEGER NOT NULL,
  return_id INTEGER,
  product_id INTEGER,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  product_name TEXT,
  product_code TEXT,
  unit_name TEXT,
  unit_conversion_factor NUMERIC DEFAULT 1,
  tax_id INTEGER,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(return_id);