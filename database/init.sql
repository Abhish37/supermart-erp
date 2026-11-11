-- ==============================================================================
-- Retail Intelligence & Decision Support System (RIDSS)
-- PostgreSQL 16 Relational Schema & Audited Ledger Engine
-- Target Facility: 4,500 sq. ft. Independent Supermarket — Dalli Rajhara
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables in reverse dependency order if migrating
DROP TABLE IF EXISTS quarantine_errors CASCADE;
DROP TABLE IF EXISTS raw_import_hashes CASCADE;
DROP TABLE IF EXISTS recommendations CASCADE;
DROP TABLE IF EXISTS local_events CASCADE;
DROP TABLE IF EXISTS khata_ledger CASCADE;
DROP TABLE IF EXISTS customer_khata CASCADE;
DROP TABLE IF EXISTS transaction_lines CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory_batches CASCADE;
DROP TABLE IF EXISTS supplier_skus CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TYPE IF EXISTS movement_type CASCADE;

-- 1. Product Master & Dimensional Hierarchy
CREATE TABLE categories (
    category_id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id VARCHAR(32) REFERENCES categories(category_id),
    department VARCHAR(50) NOT NULL -- Food, Non-Food, Staples, Fresh, Home Care
);

CREATE TABLE products (
    sku VARCHAR(64) PRIMARY KEY,
    barcode VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    category_id VARCHAR(32) REFERENCES categories(category_id) NOT NULL,
    base_unit VARCHAR(16) NOT NULL, -- 'pcs', 'kg', 'litre', 'meter'
    pack_size_qty NUMERIC(10, 3) DEFAULT 1.000,
    hsn_code VARCHAR(16),
    gst_rate NUMERIC(5, 2) NOT NULL, -- 0.00, 5.00, 12.00, 18.00, 28.00
    mrp NUMERIC(10, 2) NOT NULL,
    base_cost_price NUMERIC(10, 2) NOT NULL, -- Landed excluding GST
    current_selling_price NUMERIC(10, 2) NOT NULL, -- Excluding GST
    abc_class CHAR(1) DEFAULT 'C',
    xyz_class CHAR(1) DEFAULT 'Z',
    shelf_linear_feet NUMERIC(6, 2) DEFAULT 1.0,
    is_house_pack BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Supplier Master & Terms
CREATE TABLE suppliers (
    supplier_id VARCHAR(32) PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    gstin VARCHAR(15) UNIQUE,
    lead_time_days INT DEFAULT 3,
    lead_time_variance NUMERIC(4, 2) DEFAULT 1.0,
    payment_terms_days INT DEFAULT 7,
    returnable_policy BOOLEAN DEFAULT TRUE,
    is_authorized BOOLEAN DEFAULT TRUE
);

CREATE TABLE supplier_skus (
    supplier_id VARCHAR(32) REFERENCES suppliers(supplier_id),
    sku VARCHAR(64) REFERENCES products(sku),
    supplier_sku_code VARCHAR(64),
    purchase_price NUMERIC(10, 2) NOT NULL,
    moq INT DEFAULT 1,
    case_pack_qty INT DEFAULT 1,
    PRIMARY KEY (supplier_id, sku)
);

-- 3. Batches & Inventory Ledger (Double-Entry Verification)
CREATE TABLE inventory_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(64) REFERENCES products(sku) NOT NULL,
    lot_number VARCHAR(64) NOT NULL,
    received_quantity NUMERIC(10, 3) NOT NULL,
    remaining_quantity NUMERIC(10, 3) NOT NULL,
    landed_cost_unit NUMERIC(10, 2) NOT NULL,
    mfg_date DATE,
    expiry_date DATE NOT NULL,
    vendor_credit_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE movement_type AS ENUM (
    'PURCHASE_RECEIPT', 'SALE', 'SALE_RETURN', 'DAMAGE_WRITE_OFF', 
    'LOOSE_CONVERSION_IN', 'LOOSE_CONVERSION_OUT', 'AUDIT_CORRECTION'
);

CREATE TABLE inventory_movements (
    movement_id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(64) REFERENCES products(sku) NOT NULL,
    batch_id UUID REFERENCES inventory_batches(batch_id),
    movement_type movement_type NOT NULL,
    quantity_delta NUMERIC(10, 3) NOT NULL, -- Positive for in, Negative for out
    unit_cost NUMERIC(10, 2) NOT NULL,
    reference_id VARCHAR(64) NOT NULL, -- receipt_id, grn_number, or audit_id
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Transaction Sales & Khata System
CREATE TABLE transactions (
    receipt_id VARCHAR(64) PRIMARY KEY,
    cashier_id VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    gross_total NUMERIC(12, 2) NOT NULL,
    discount_total NUMERIC(12, 2) DEFAULT 0.00,
    gst_total NUMERIC(12, 2) NOT NULL,
    net_total NUMERIC(12, 2) NOT NULL,
    payment_mode VARCHAR(32) NOT NULL, -- 'CASH', 'UPI', 'CARD', 'KHATA', 'SPLIT'
    customer_id VARCHAR(64),
    is_cancelled BOOLEAN DEFAULT FALSE
);

CREATE TABLE transaction_lines (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id VARCHAR(64) REFERENCES transactions(receipt_id) ON DELETE CASCADE,
    sku VARCHAR(64) REFERENCES products(sku) NOT NULL,
    batch_id UUID REFERENCES inventory_batches(batch_id),
    quantity NUMERIC(10, 3) NOT NULL,
    unit_selling_price NUMERIC(10, 2) NOT NULL, -- Excl. Tax
    unit_landed_cost NUMERIC(10, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL,
    tax_amount NUMERIC(10, 2) NOT NULL,
    line_total NUMERIC(10, 2) NOT NULL
);

CREATE TABLE customer_khata (
    account_id VARCHAR(64) PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    credit_limit NUMERIC(10, 2) DEFAULT 5000.00,
    current_balance NUMERIC(10, 2) DEFAULT 0.00,
    last_payment_date TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'ACTIVE' -- 'ACTIVE', 'FROZEN', 'SETTLED'
);

CREATE TABLE khata_ledger (
    entry_id BIGSERIAL PRIMARY KEY,
    account_id VARCHAR(64) REFERENCES customer_khata(account_id),
    receipt_id VARCHAR(64) REFERENCES transactions(receipt_id),
    entry_type VARCHAR(16) NOT NULL, -- 'DEBIT' (purchase), 'CREDIT' (payment)
    amount NUMERIC(10, 2) NOT NULL,
    balance_after NUMERIC(10, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Local Festival & Demand Calendar
CREATE TABLE local_events (
    event_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    category_id VARCHAR(32) REFERENCES categories(category_id),
    demand_multiplier NUMERIC(4, 2) DEFAULT 1.20,
    notes TEXT
);

-- 6. Recommendations & Approvals Log
CREATE TABLE recommendations (
    rec_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type VARCHAR(32) NOT NULL, -- 'REORDER', 'MARKDOWN', 'RTV_CLAIM', 'REBUNDLE'
    sku VARCHAR(64) REFERENCES products(sku),
    suggested_value NUMERIC(10, 2) NOT NULL,
    rationale TEXT NOT NULL,
    evidence_payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DISMISSED'
    decision_by VARCHAR(32),
    decision_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Staging Audit & Deduplication
CREATE TABLE raw_import_hashes (
    file_hash VARCHAR(64) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    total_rows INT DEFAULT 0,
    imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quarantine_errors (
    error_id BIGSERIAL PRIMARY KEY,
    file_hash VARCHAR(64) REFERENCES raw_import_hashes(file_hash),
    row_number INT NOT NULL,
    raw_data JSONB NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'UNRESOLVED', -- 'UNRESOLVED', 'REMAPPED', 'DISCARDED'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- High-Velocity Operational Query Indexes
CREATE INDEX IF NOT EXISTS idx_movements_sku_date ON inventory_movements(sku, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_lines_sku ON transaction_lines(sku);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date, remaining_quantity);
CREATE INDEX IF NOT EXISTS idx_batches_sku ON inventory_batches(sku, remaining_quantity);
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_khata_ledger_account ON khata_ledger(account_id, recorded_at);
