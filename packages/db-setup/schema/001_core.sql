-- packages/db-setup/migrations/001_core.sql
-- Module 1: Core / foundation tables (users, settings, lookup tables)
-- These tables have no foreign-key dependency on any other module.

-- Tracking table used by runMigrations.js to know which migration files
-- have already been applied. Always created first.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'pos')),
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recovery_key_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pin_reset_audit (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  administrator_id INTEGER,
  target_user_id INTEGER,
  device TEXT,
  reset_type TEXT NOT NULL CHECK (reset_type IN ('admin_reset', 'recovery_key')),
  FOREIGN KEY (administrator_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS currencies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  latin_name TEXT,
  minor_name TEXT,
  minor_latin_name TEXT,
  code TEXT UNIQUE,
  exchange_rate NUMERIC DEFAULT 1,
  symbol TEXT,
  is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS unit (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE,
  latin_name TEXT,
  code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE,
  rate NUMERIC DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'product' CHECK (category IN ('product', 'invoice', 'both'))
);

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
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
  allow_negative_stock BOOLEAN DEFAULT FALSE,
  minimum_stock NUMERIC DEFAULT 0,
  pos_invoice_tax_mode TEXT DEFAULT 'manual' CHECK (pos_invoice_tax_mode IN ('manual', 'fixed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (base_currency_id) REFERENCES currencies(id)
);

CREATE TABLE IF NOT EXISTS company_default_pos_taxes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (tax_id) REFERENCES taxes(id)
);

-- Tags and taggables tables for tagging products, customers, suppliers, invoices, etc.

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  latin_name TEXT,
  color TEXT,
  scope TEXT CHECK (scope IN (
    'product','customer','supplier','partner',
    'sales_invoice','sales_return','sales_quotation',
    'purchase_invoice','purchase_return',
    'expense','payment'
  ) OR scope IS NULL),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, scope)
);

CREATE TABLE IF NOT EXISTS taggables (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'product','customer','supplier','partner',
    'sales_invoice','sales_return','sales_quotation',
    'purchase_invoice','purchase_return',
    'expense','payment'
  )),
  entity_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(tag_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_taggables_tag ON taggables(tag_id);
CREATE INDEX IF NOT EXISTS idx_taggables_entity ON taggables(entity_type, entity_id);