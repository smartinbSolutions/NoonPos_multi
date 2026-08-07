-- packages/db-setup/schema/008_payments.sql
-- Module 8: Payments & party ledger
-- Depends on: funds (Module 4), users (Module 1)
-- Note: invoice_id on payment_allocations/party_history is intentionally NOT a
-- foreign key — it's polymorphic, pointing at different tables depending on
-- invoice_type (sales_invoices, purchase_invoices, expense, etc.), same as
-- in the original SQLite schema.

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT, -- income / expense
  party_type TEXT, -- customer / supplier / other
  party_id INTEGER,
  fund_id INTEGER,
  amount NUMERIC,
  currency_code TEXT, -- USD / TRY / EUR
  exchange_rate NUMERIC, -- Exchange rate at time of payment
  effective_rate NUMERIC, -- Effective rate at time of payment
  amount_fund_currency NUMERIC,
  note TEXT,
  date TIMESTAMPTZ,
  created_by INTEGER,
  invoice_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (fund_id) REFERENCES funds(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  invoice_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

CREATE TABLE IF NOT EXISTS deleted_payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id INTEGER NOT NULL,
  payload TEXT NOT NULL, -- JSON snapshot of { payment, allocations } at time of deletion
  deleted_by INTEGER,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS party_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier', 'partner')),
  party_id INTEGER,
  record_type TEXT NOT NULL CHECK (record_type IN ('opening_balance', 'invoice', 'return', 'payment')),
  invoice_id INTEGER,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('opening_balance', 'expense', 'purchase', 'purchase_return', 'sales', 'sales_return', 'payment')),
  payment_id INTEGER,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('increase', 'decrease')),
  amount NUMERIC,
  date TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_party_history_party ON party_history(party_type, party_id);