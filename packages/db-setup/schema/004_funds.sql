-- packages/db-setup/schema/004_funds.sql
-- Module 4: Funds
-- Depends on: currencies, users (Module 1 - core)

CREATE TABLE IF NOT EXISTS funds (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT,
  currency_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (currency_id) REFERENCES currencies(id)
);

CREATE TABLE IF NOT EXISTS fund_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_id INTEGER,
  record_type TEXT NOT NULL CHECK (record_type IN ('payment', 'transfer', 'opening_balance')),
  payment_id INTEGER,
  date TIMESTAMPTZ,
  movement_type TEXT,
  amount NUMERIC,
  note TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (fund_id) REFERENCES funds(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fund_transfers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_fund_id INTEGER,
  to_fund_id INTEGER,
  deduct_amount NUMERIC,
  receive_amount NUMERIC,
  exchange_rate NUMERIC,
  effective_rate NUMERIC,
  note TEXT,
  date TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (from_fund_id) REFERENCES funds(id),
  FOREIGN KEY (to_fund_id) REFERENCES funds(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fund_history_fund ON fund_history(fund_id);