-- packages/db-setup/schema/005_sales.sql
-- Module 5: Sales
-- Depends on: customers (Module 2), products, taxes (Module 1/3), users (Module 1)

CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_name TEXT,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'manual' CHECK (channel IN ('manual', 'pos')),
  date TIMESTAMPTZ,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  description TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  net_total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_invoice_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  buying_price NUMERIC DEFAULT 0,
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
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sales_invoice_id INTEGER,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'manual' CHECK (channel IN ('manual', 'pos')),
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

CREATE TABLE IF NOT EXISTS sales_return_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (return_id) REFERENCES sales_returns(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sales_invoice_item_id INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS sales_quotations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quotation_name TEXT,
  customer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  date TIMESTAMPTZ,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  description TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  net_total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_quotation_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quotation_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS sales_quotation_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quotation_id INTEGER NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (quotation_id) REFERENCES sales_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_quotation_items_quotation ON sales_quotation_items(quotation_id);