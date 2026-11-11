-- ==============================================================================
-- Dalli Rajhara Hyperlocal Master Seed Data
-- Supermarket: 4,500 sq. ft. Independent Store, Balod District, Chhattisgarh
-- ==============================================================================

-- 1. Categories
INSERT INTO categories (category_id, name, parent_id, department) VALUES
('CAT-STAPLES', 'Grains, Flours & Bulk Staples', NULL, 'Staples'),
('CAT-EDIBLE-OIL', 'Edible Oils & Fats', 'CAT-STAPLES', 'Staples'),
('CAT-PULSES', 'Dals & Pulses', 'CAT-STAPLES', 'Staples'),
('CAT-DAIRY', 'Dairy & Ghee', NULL, 'Fresh'),
('CAT-FOOD', 'Packaged Sweets & Snacks', NULL, 'Food'),
('CAT-AGRI', 'Agricultural & Household Tools', NULL, 'Non-Food'),
('CAT-HOUSE-PACK', 'In-Store Repackaged Grains', 'CAT-STAPLES', 'Staples')
ON CONFLICT (category_id) DO NOTHING;

-- 2. Suppliers
INSERT INTO suppliers (supplier_id, legal_name, trade_name, gstin, lead_time_days, lead_time_variance, payment_terms_days, returnable_policy, is_authorized) VALUES
('SUP-DURG-01', 'Durg Wholesale Grocery Syndicate Pvt Ltd', 'Durg Agro Trade', '22AABCD1234E1Z5', 5, 1.2, 14, TRUE, TRUE),
('SUP-BHILAI-01', 'Bhilai Dairy & Edible Products Distributors', 'Bhilai Supply Line', '22BBDCE5678F2Z1', 3, 0.7, 7, TRUE, TRUE),
('SUP-RAIPUR-01', 'Raipur Regional FMCG Logistics Hub', 'Raipur Super Depot', '22CCDDE9012G3Z8', 7, 1.8, 21, FALSE, TRUE),
('SUP-LOCAL-01', 'Rajhara Mandi Direct Commodities', 'Rajhara Local Trader', '22DDEEF3456H4Z2', 2, 0.4, 7, FALSE, TRUE)
ON CONFLICT (supplier_id) DO NOTHING;

-- 3. Products
INSERT INTO products (sku, barcode, name, brand, category_id, base_unit, pack_size_qty, hsn_code, gst_rate, mrp, base_cost_price, current_selling_price, abc_class, xyz_class, shelf_linear_feet, is_house_pack, is_active) VALUES
('SKU-RICE-50', '890100000001', 'HMT Kolam Rice Premium 50kg Sack', 'Kolam Royal', 'CAT-STAPLES', 'kg', 1.0, '100630', 0.00, 2800.00, 2450.00, 2800.00, 'A', 'X', 4.0, FALSE, TRUE),
('SKU-RICE-25', '890100000002', 'HMT Kolam Rice Premium 25kg Bag', 'Kolam Royal', 'CAT-STAPLES', 'kg', 1.0, '100630', 0.00, 1450.00, 1260.00, 1450.00, 'A', 'X', 3.5, FALSE, TRUE),
('SKU-ATTA-20', '890100000003', 'Sharbati Whole Wheat Chakki Atta 20kg', 'Annapurna Gold', 'CAT-STAPLES', 'kg', 1.0, '110100', 0.00, 780.00, 680.00, 780.00, 'A', 'X', 3.0, FALSE, TRUE),
('SKU-ATTA-10', '890100000004', 'Sharbati Whole Wheat Chakki Atta 10kg', 'Annapurna Gold', 'CAT-STAPLES', 'kg', 1.0, '110100', 0.00, 400.00, 350.00, 400.00, 'A', 'X', 2.5, FALSE, TRUE),
('SKU-OIL-15L', '890100000005', 'Fortune Refined Soyabean Oil 15L Tin', 'Fortune', 'CAT-EDIBLE-OIL', 'litre', 1.0, '150790', 5.00, 1950.00, 1720.00, 1857.14, 'A', 'X', 3.0, FALSE, TRUE),
('SKU-OIL-01', '890100000006', 'Fortune Soyabean Oil 1L Pouch', 'Fortune', 'CAT-EDIBLE-OIL', 'litre', 12.0, '150790', 5.00, 135.00, 115.00, 128.57, 'A', 'X', 2.0, FALSE, TRUE),
('SKU-SUGAR-5', '890100000007', 'Madhur Pure & Hygienic Sugar 5kg', 'Madhur', 'CAT-STAPLES', 'kg', 6.0, '170199', 0.00, 240.00, 210.00, 240.00, 'A', 'X', 2.0, FALSE, TRUE),
('SKU-GHEE-01', '890100000008', 'Amul Pure Cow Ghee 1L Tin', 'Amul', 'CAT-DAIRY', 'litre', 6.0, '040590', 12.00, 610.00, 540.00, 544.64, 'B', 'Y', 1.5, FALSE, TRUE),
('SKU-JAGGERY-1K', '890100000009', 'Durg Artisanal Gur / Jaggery Block 1kg', 'Desi Mandi', 'CAT-FOOD', 'kg', 20.0, '170114', 0.00, 70.00, 52.00, 70.00, 'B', 'Y', 1.5, FALSE, TRUE),
('SKU-COCONUT-1', '890100000010', 'Pooja Dry Coconut Whole (Gola)', 'Desi Mandi', 'CAT-FOOD', 'pcs', 50.0, '080119', 0.00, 35.00, 24.00, 35.00, 'C', 'Z', 1.0, FALSE, TRUE),
('SKU-SICKLE-01', '890100000011', 'Chhattisgarh Agricultural Sickle / Hansiya', 'Rajhara Iron Craft', 'CAT-AGRI', 'pcs', 10.0, '820140', 18.00, 150.00, 105.00, 127.12, 'C', 'Z', 1.0, FALSE, TRUE),
('SKU-SWEETS-500', '890100000012', 'Haldirams Kaju Katli Gift Pack 500g', 'Haldirams', 'CAT-FOOD', 'pcs', 12.0, '210690', 5.00, 480.00, 390.00, 457.14, 'B', 'Y', 2.0, FALSE, TRUE),
('SKU-BULK-DAL50', '890100000013', 'Unbranded Raw Toor Dal 50kg Sack', 'Mandi Bulk', 'CAT-PULSES', 'kg', 1.0, '071360', 0.00, 7000.00, 6200.00, 7000.00, 'A', 'X', 2.0, FALSE, TRUE),
('SKU-PACK-DAL1', '890100000014', 'Rajhara Supermart In-Store Toor Dal 1kg', 'Rajhara Fresh', 'CAT-HOUSE-PACK', 'kg', 25.0, '071360', 0.00, 165.00, 125.00, 165.00, 'A', 'X', 2.0, TRUE, TRUE)
ON CONFLICT (sku) DO NOTHING;

-- 4. Supplier SKU Mappings
INSERT INTO supplier_skus (supplier_id, sku, supplier_sku_code, purchase_price, moq, case_pack_qty) VALUES
('SUP-DURG-01', 'SKU-RICE-50', 'DURG-RICE-50K', 2450.00, 10, 1),
('SUP-DURG-01', 'SKU-RICE-25', 'DURG-RICE-25K', 1260.00, 20, 1),
('SUP-DURG-01', 'SKU-ATTA-20', 'DURG-ATTA-20K', 680.00, 15, 1),
('SUP-DURG-01', 'SKU-ATTA-10', 'DURG-ATTA-10K', 350.00, 25, 1),
('SUP-BHILAI-01', 'SKU-OIL-15L', 'BHILAI-OIL-15L', 1720.00, 5, 1),
('SUP-BHILAI-01', 'SKU-OIL-01', 'BHILAI-OIL-1L', 115.00, 24, 12),
('SUP-BHILAI-01', 'SKU-GHEE-01', 'BHILAI-GHEE-1L', 540.00, 6, 6),
('SUP-RAIPUR-01', 'SKU-SUGAR-5', 'RAIPUR-SUGAR-5K', 210.00, 12, 6),
('SUP-RAIPUR-01', 'SKU-SWEETS-500', 'RAIPUR-HALD-500G', 390.00, 12, 12),
('SUP-LOCAL-01', 'SKU-JAGGERY-1K', 'LOC-GUR-1K', 52.00, 20, 20),
('SUP-LOCAL-01', 'SKU-COCONUT-1', 'LOC-COC-DRY', 24.00, 50, 50),
('SUP-LOCAL-01', 'SKU-SICKLE-01', 'LOC-AGRI-SICKLE', 105.00, 10, 10),
('SUP-LOCAL-01', 'SKU-BULK-DAL50', 'LOC-DAL-50K', 6200.00, 2, 1)
ON CONFLICT (supplier_id, sku) DO NOTHING;

-- 5. Local Festival & Demand Calendar (Dalli Rajhara Specific)
INSERT INTO local_events (event_id, name, start_date, end_date, category_id, demand_multiplier, notes) VALUES
(1, 'Pola Festival (Bhadrapada Cattle & Sweet Surge)', '2026-09-08', '2026-09-14', 'CAT-FOOD', 1.40, 'Massive surge in jaggery, edible oil, besan, and festive sweets.'),
(2, 'Hareli Agriculture Festival', '2026-08-11', '2026-08-16', 'CAT-AGRI', 1.35, 'Demand spikes in agricultural hand sickles, dry pooja coconut, sweets.'),
(3, 'Durgotsav & Diwali Grand Festive Rush', '2026-10-18', '2026-11-05', 'CAT-DAIRY', 2.10, 'Peak annual consumption of pure ghee, confectionery, gift hampers, oil tins.'),
(4, 'SAIL Bhilai Steel Plant Mining Monthly Payday', '2026-11-01', '2026-11-07', 'CAT-STAPLES', 1.35, 'Township salary disbursement: bulk staple buying in 25/50kg sacks and 15L tins.')
ON CONFLICT (event_id) DO NOTHING;

-- 6. Customer Khata (Local Mining Families & Canteens)
INSERT INTO customer_khata (account_id, customer_name, phone_number, credit_limit, current_balance, last_payment_date, status) VALUES
('KH-001', 'Rajesh Mining Contractors', '9893011223', 25000.00, 12500.00, '2026-10-28', 'ACTIVE'),
('KH-002', 'BSP Employees Canteen Sub-Unit 4', '9425098765', 50000.00, 31400.00, '2026-10-15', 'ACTIVE'),
('KH-003', 'Ramesh Tiwari (Mine Ward 7)', '9827055443', 10000.00, 4200.00, '2026-11-02', 'ACTIVE'),
('KH-004', 'Dalli Workers Tiffin Center', '9754012399', 15000.00, 14850.00, '2026-09-20', 'ACTIVE'),
('KH-005', 'Smt. Sunita Verma (Retired BSP Staff)', '9907033211', 5000.00, 850.00, '2026-11-05', 'ACTIVE')
ON CONFLICT (account_id) DO NOTHING;

-- 7. Inventory Batches (FEFO Tracking with Expiring Lots)
INSERT INTO inventory_batches (batch_id, sku, lot_number, received_quantity, remaining_quantity, landed_cost_unit, mfg_date, expiry_date, vendor_credit_eligible) VALUES
('b1111111-0000-0000-0000-000000000001', 'SKU-OIL-01', 'LOT-OIL-2026A', 48.0, 12.0, 115.00, '2026-05-01', '2026-12-05', TRUE),   -- Near Expiry (under 30d)
('b1111111-0000-0000-0000-000000000002', 'SKU-OIL-01', 'LOT-OIL-2026B', 96.0, 72.0, 115.00, '2026-08-10', '2027-08-10', TRUE),   -- Fresh stock
('b1111111-0000-0000-0000-000000000003', 'SKU-RICE-25', 'LOT-RICE-OCT', 60.0, 18.0, 1260.00, '2026-10-01', '2027-10-01', FALSE), -- Low stock A-Item
('b1111111-0000-0000-0000-000000000004', 'SKU-GHEE-01', 'LOT-GHEE-AUG', 30.0, 8.0, 540.00, '2026-08-01', '2027-02-01', TRUE),   -- Under 90d, returnable
('b1111111-0000-0000-0000-000000000005', 'SKU-SWEETS-500', 'LOT-HALD-DIWALI', 50.0, 15.0, 390.00, '2026-10-15', '2026-11-28', TRUE) -- Imminent expiry (<20d)
ON CONFLICT (batch_id) DO NOTHING;
