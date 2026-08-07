-- packages/db-setup/schema/007_expenses.sql
-- Module 7: Expenses
-- Depends on: taxes (Module 1), users (Module 1)
-- NOTE: table renamed from original "expence_category" (typo) to "expense_category"

CREATE TABLE IF NOT EXISTS expense_category (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  latin_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id INTEGER,
  invoice_name TEXT,
  description TEXT,
  date TIMESTAMPTZ,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  net_total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expense_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id INTEGER,
  category_id INTEGER,
  price NUMERIC,
  total NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  discount_rate NUMERIC DEFAULT 0,
  tax_id INTEGER,
  tax_rate NUMERIC DEFAULT 0,
  tax_value NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (expense_id) REFERENCES expense(id),
  FOREIGN KEY (category_id) REFERENCES expense_category(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS expense_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id INTEGER NOT NULL,
  tax_id INTEGER,
  tax_name TEXT,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (expense_id) REFERENCES expense(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_items_expense ON expense_items(expense_id);