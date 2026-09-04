-- packages/db-setup/schema/009_manufacturing.sql
-- Module 9: Manufacturing (BOM + Manufacturing Orders)
-- Depends on: products, product_units (Module 3), users (Module 1)

CREATE TABLE IF NOT EXISTS boms (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Standard',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_boms_one_default_per_product
  ON boms(product_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS bom_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bom_id INTEGER NOT NULL,
  raw_material_product_id INTEGER NOT NULL,
  unit_id INTEGER,
  unit_name TEXT,
  unit_conversion_factor NUMERIC DEFAULT 1,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
  UNIQUE(bom_id, raw_material_product_id)
);

CREATE TABLE IF NOT EXISTS manufacturing_orders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_name TEXT,
  bom_id INTEGER,
  output_product_id INTEGER NOT NULL,

  output_quantity NUMERIC NOT NULL,
  output_unit_name TEXT,
  output_unit_conversion_factor NUMERIC DEFAULT 1,

  labor_cost NUMERIC NOT NULL DEFAULT 0,
  overhead_cost NUMERIC NOT NULL DEFAULT 0,
  raw_material_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,

  date TIMESTAMPTZ,
  description TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE SET NULL,
  FOREIGN KEY (output_product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS manufacturing_order_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manufacturing_order_id INTEGER NOT NULL,
  raw_material_product_id INTEGER NOT NULL,

  quantity NUMERIC NOT NULL,
  unit_name TEXT,
  unit_conversion_factor NUMERIC DEFAULT 1,

  unit_cost_snapshot NUMERIC NOT NULL DEFAULT 0,
  line_cost NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),

  FOREIGN KEY (manufacturing_order_id) REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_product_id) REFERENCES products(id) ON DELETE RESTRICT,
  UNIQUE(manufacturing_order_id, raw_material_product_id)
);

CREATE INDEX IF NOT EXISTS idx_bom_items_bom ON bom_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_items_order ON manufacturing_order_items(manufacturing_order_id);