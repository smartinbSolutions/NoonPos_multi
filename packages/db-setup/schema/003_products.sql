-- packages/db-setup/schema/003_products.sql
-- Module 3: Products & inventory
-- Depends on: unit, taxes (Module 1 - core)

CREATE TABLE IF NOT EXISTS products (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  latin_name TEXT,
  code TEXT,
  description TEXT,
  cost_price NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0,
  logo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  unit_id INTEGER,
  tax_id INTEGER,
  type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'service')),
  FOREIGN KEY (unit_id) REFERENCES unit(id),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

CREATE TABLE IF NOT EXISTS product_units (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INTEGER NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor NUMERIC NOT NULL DEFAULT 1,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  barcode TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_movements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
      'adjustment',
      'manufacturing'

    )
  ),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  action TEXT NOT NULL,
  enter_price NUMERIC DEFAULT 0,
  out_price NUMERIC DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  base_unit_name TEXT,
  unit_name TEXT,
  conversion_factor NUMERIC DEFAULT 1,
  date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INTEGER,
  barcode TEXT UNIQUE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_imports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  skipped_products_count INTEGER DEFAULT 0,
  skipped_barcodes_count INTEGER DEFAULT 0,
  skipped_invalid_count INTEGER DEFAULT 0,
  skipped_units_count INTEGER DEFAULT 0,
  report_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_import_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id INTEGER NOT NULL,
  row_number INTEGER,
  status TEXT NOT NULL, -- 'created' | 'skipped_product' | 'skipped_barcode' | 'skipped_invalid' | 'skipped_unit'
  product_id INTEGER,
  product_name TEXT,
  barcode TEXT,
  reason TEXT,
  FOREIGN KEY (import_id) REFERENCES product_imports(id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_movements_product ON product_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(product_id);