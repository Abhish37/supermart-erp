const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Client } = require('pg');

// EAN-13 Generator with modulo-10 checksum
function generateEAN13(prefix9) {
  const digits = prefix9.toString().padStart(12, '0').slice(0, 12);
  let oddSum = 0;
  let evenSum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    if (i % 2 === 0) {
      oddSum += d;
    } else {
      evenSum += d;
    }
  }
  const total = oddSum + (evenSum * 3);
  const checkDigit = (10 - (total % 10)) % 10;
  return digits + checkDigit.toString();
}

async function run() {
  console.log('Connecting to PostgreSQL...');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  try {
    console.log('Applying non-destructive table schemas (CREATE TABLE IF NOT EXISTS & ALTER TABLE ADD COLUMN)...');

    // 1. PRODUCTS MASTER
    await client.query(`
      CREATE TABLE IF NOT EXISTS products_master (
        sku_id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        barcode text,
        daily_fluctuation_flag boolean DEFAULT false NOT NULL,
        target_margin_pct numeric(5, 2) DEFAULT '15.00' NOT NULL,
        min_stock_threshold integer DEFAULT 20 NOT NULL,
        base_wholesale_rate numeric(10, 2) DEFAULT '0.00' NOT NULL,
        cost_price numeric(10, 2) DEFAULT '0.00' NOT NULL,
        selling_price numeric(10, 2) DEFAULT '0.00' NOT NULL,
        vendor_name text DEFAULT 'Apex Agro Wholesale',
        vendor_phone text DEFAULT '+919876543210',
        dealer_id text,
        unit_type text DEFAULT 'kg',
        min_monthly_target integer DEFAULT 100 NOT NULL,
        flaw_flag boolean DEFAULT false NOT NULL,
        max_capacity_days integer DEFAULT 21 NOT NULL,
        lead_time_days integer DEFAULT 3 NOT NULL,
        max_lead_time_days integer DEFAULT 7 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS barcode text;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS cost_price numeric(10, 2) DEFAULT '0.00' NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS selling_price numeric(10, 2) DEFAULT '0.00' NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS dealer_id text;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS min_monthly_target integer DEFAULT 100 NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS flaw_flag boolean DEFAULT false NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS max_capacity_days integer DEFAULT 21 NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 3 NOT NULL;
      ALTER TABLE products_master ADD COLUMN IF NOT EXISTS max_lead_time_days integer DEFAULT 7 NOT NULL;
    `);

    // 2. INVENTORY BATCHES
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_batches (
        batch_id text PRIMARY KEY NOT NULL,
        sku_id text NOT NULL REFERENCES products_master(sku_id) ON DELETE CASCADE,
        barcode text NOT NULL UNIQUE,
        arrival_date timestamp with time zone DEFAULT now() NOT NULL,
        cost_price numeric(10, 2) NOT NULL,
        current_selling_price numeric(10, 2) NOT NULL,
        status text DEFAULT 'Storage' NOT NULL,
        quantity integer DEFAULT 1 NOT NULL,
        unit_weight_kg numeric(8, 3) DEFAULT '1.000' NOT NULL,
        parent_bulk_batch_id text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        sold_at timestamp with time zone
      );
    `);

    // 3. STORE LAYOUT
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_layout (
        id text PRIMARY KEY NOT NULL,
        aisle_id text NOT NULL,
        shelf_section text NOT NULL,
        sku_id text NOT NULL REFERENCES products_master(sku_id) ON DELETE CASCADE,
        max_shelf_capacity integer DEFAULT 100 NOT NULL,
        current_shelf_stock integer DEFAULT 0 NOT NULL,
        floor_level integer DEFAULT 0 NOT NULL,
        sales_velocity_score numeric(8, 2) DEFAULT '1.00' NOT NULL,
        performance_status text DEFAULT 'STEADY' NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
      ALTER TABLE store_layout ADD COLUMN IF NOT EXISTS sales_velocity_score numeric(8, 2) DEFAULT '1.00' NOT NULL;
      ALTER TABLE store_layout ADD COLUMN IF NOT EXISTS performance_status text DEFAULT 'STEADY' NOT NULL;
    `);

    // 4. EMPLOYEES
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        employee_id text PRIMARY KEY NOT NULL,
        pin_hash text NOT NULL,
        name text NOT NULL,
        phone text NOT NULL,
        address text DEFAULT 'SuperMart Staff Quarters',
        role text DEFAULT 'CASHIER' NOT NULL,
        base_salary numeric(10, 2) DEFAULT '18000.00' NOT NULL,
        bonuses numeric(10, 2) DEFAULT '0.00' NOT NULL,
        fault_count integer DEFAULT 0 NOT NULL,
        active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 5. EMPLOYEE DEDUCTIONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_deductions (
        deduction_id text PRIMARY KEY NOT NULL,
        employee_id text NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
        amount numeric(10, 2) NOT NULL,
        reason text NOT NULL,
        deduction_date timestamp with time zone DEFAULT now() NOT NULL,
        notes text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 6. CASH RECONCILIATIONS
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_reconciliations (
        reconciliation_id text PRIMARY KEY NOT NULL,
        pos_terminal_id text NOT NULL,
        cashier_id text NOT NULL REFERENCES employees(employee_id),
        opening_buffer numeric(10, 2) DEFAULT '3000.00' NOT NULL,
        physical_cash numeric(10, 2) NOT NULL,
        system_cash numeric(10, 2) NOT NULL,
        discrepancy numeric(10, 2) NOT NULL,
        deduction_logged boolean DEFAULT false NOT NULL,
        notes text,
        reconciled_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 7. VENDORS / DEALERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        vendor_id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        phone text NOT NULL,
        email text,
        address text,
        linked_skus text,
        supply_rate numeric(10, 2) DEFAULT '0.00' NOT NULL,
        active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 8. REORDER QUEUE & PURCHASE ORDERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS reorder_queue (
        reorder_id text PRIMARY KEY NOT NULL,
        po_number text NOT NULL UNIQUE,
        vendor_id text NOT NULL REFERENCES vendors(vendor_id),
        sku_id text NOT NULL REFERENCES products_master(sku_id),
        reorder_qty integer NOT NULL,
        unit_cost numeric(10, 2) NOT NULL,
        total_cost numeric(12, 2) NOT NULL,
        status text DEFAULT 'SUGGESTED' NOT NULL,
        trigger_reason text DEFAULT 'ROP_BREACH' NOT NULL,
        ordered_at timestamp with time zone,
        arrived_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 9. SKU MATH METRICS
    await client.query(`
      CREATE TABLE IF NOT EXISTS sku_math_metrics (
        metric_id text PRIMARY KEY NOT NULL,
        sku_id text NOT NULL UNIQUE REFERENCES products_master(sku_id) ON DELETE CASCADE,
        avg_daily_sales_peak numeric(10, 2) DEFAULT '15.00' NOT NULL,
        avg_daily_sales_trough numeric(10, 2) DEFAULT '7.00' NOT NULL,
        avg_lead_time_days numeric(5, 2) DEFAULT '3.00' NOT NULL,
        max_daily_sales_peak numeric(10, 2) DEFAULT '35.00' NOT NULL,
        max_daily_sales_trough numeric(10, 2) DEFAULT '15.00' NOT NULL,
        max_lead_time_days numeric(5, 2) DEFAULT '6.00' NOT NULL,
        current_phase text DEFAULT 'TROUGH' NOT NULL,
        safety_stock integer DEFAULT 20 NOT NULL,
        reorder_point integer DEFAULT 40 NOT NULL,
        max_capacity_supply integer DEFAULT 150 NOT NULL,
        order_quantity integer DEFAULT 110 NOT NULL,
        current_inventory integer DEFAULT 50 NOT NULL,
        reorder_alert_triggered boolean DEFAULT false NOT NULL,
        last_calculated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 10. SUPPLY CHAIN 3-WAY RECONCILIATION
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_reconciliation (
        reconciliation_id text PRIMARY KEY NOT NULL,
        sku_id text NOT NULL REFERENCES products_master(sku_id),
        batch_id text,
        units_received_storage_a integer DEFAULT 0 NOT NULL,
        units_moved_cartons_b integer DEFAULT 0 NOT NULL,
        units_sold_pos_c integer DEFAULT 0 NOT NULL,
        current_shelf_stock integer DEFAULT 0 NOT NULL,
        discrepancy integer DEFAULT 0 NOT NULL,
        shrinkage_alert boolean DEFAULT false NOT NULL,
        status text DEFAULT 'VERIFIED' NOT NULL,
        notes text,
        reconciled_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 11. PINELABS HARDWARE TERMINAL LOGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS pinelabs_terminal_logs (
        request_id text PRIMARY KEY NOT NULL,
        pos_terminal_id text NOT NULL,
        transaction_id text,
        payment_mode text NOT NULL,
        amount numeric(12, 2) NOT NULL,
        status text DEFAULT 'INITIATED' NOT NULL,
        device_rrn text,
        response_payload text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 12. SALES LEDGER
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_ledger (
        transaction_id text PRIMARY KEY NOT NULL,
        pos_terminal_id text NOT NULL,
        cashier_id text DEFAULT 'EMP-101' NOT NULL,
        cashier_name text DEFAULT 'Ramesh Kumar' NOT NULL,
        total_amount numeric(12, 2) NOT NULL,
        rounded_amount numeric(12, 2) DEFAULT 0.00 NOT NULL,
        payment_mode text DEFAULT 'Cash' NOT NULL,
        payment_ref_id text,
        status text DEFAULT 'COMPLETED' NOT NULL,
        voided_reason text,
        sync_status text DEFAULT 'LOCAL_COMMITTED' NOT NULL,
        timestamp timestamp with time zone DEFAULT now() NOT NULL
      );
      ALTER TABLE sales_ledger ADD COLUMN IF NOT EXISTS cashier_id text DEFAULT 'EMP-101' NOT NULL;
      ALTER TABLE sales_ledger ADD COLUMN IF NOT EXISTS cashier_name text DEFAULT 'Ramesh Kumar' NOT NULL;
      ALTER TABLE sales_ledger ADD COLUMN IF NOT EXISTS rounded_amount numeric(12, 2) DEFAULT 0.00 NOT NULL;
      ALTER TABLE sales_ledger ADD COLUMN IF NOT EXISTS payment_ref_id text;
      ALTER TABLE sales_ledger ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'LOCAL_COMMITTED' NOT NULL;
    `);

    // 13. SALES ITEMS
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_items (
        item_id text PRIMARY KEY NOT NULL,
        transaction_id text NOT NULL REFERENCES sales_ledger(transaction_id) ON DELETE CASCADE,
        batch_id text NOT NULL REFERENCES inventory_batches(batch_id),
        sku_id text NOT NULL REFERENCES products_master(sku_id),
        selling_price_at_time numeric(10, 2) NOT NULL,
        cogs numeric(10, 2) NOT NULL,
        quantity integer DEFAULT 1 NOT NULL
      );
    `);

    // 14. FINANCIAL OVERHEAD
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_overhead (
        overhead_id text PRIMARY KEY NOT NULL,
        expense_category text NOT NULL,
        amount numeric(12, 2) NOT NULL,
        expense_date timestamp with time zone DEFAULT now() NOT NULL,
        notes text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 15. CLOUD SYNC QUEUE
    await client.query(`
      CREATE TABLE IF NOT EXISTS cloud_sync_queue (
        queue_id text PRIMARY KEY NOT NULL,
        table_name text NOT NULL,
        record_id text NOT NULL,
        operation text NOT NULL,
        payload text NOT NULL,
        sync_status text DEFAULT 'PENDING' NOT NULL,
        retry_count integer DEFAULT 0 NOT NULL,
        error_message text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        synced_at timestamp with time zone
      );
    `);

    console.log('All 15 tables and columns verified.');

    // Seed Master Data
    console.log('Seeding employees, vendors, product master, math metrics, and supply chain reconciliation...');

    // A. Employees
    const empList = [
      { id: 'EMP-101', name: 'Ramesh Kumar', pin: '1234', phone: '+919876500101', role: 'CASHIER', salary: '18000.00', faults: 1 },
      { id: 'EMP-102', name: 'Sunita Devi', pin: '4321', phone: '+919876500102', role: 'CASHIER', salary: '18500.00', faults: 4 }, // >3 faults (Yellow)
      { id: 'EMP-103', name: 'Amit Patel', pin: '9999', phone: '+919876500103', role: 'CASHIER', salary: '17500.00', faults: 6 }, // >5 faults (Red)
      { id: 'EMP-104', name: 'Vikram Singh', pin: '5555', phone: '+919876500104', role: 'FLOOR_MANAGER', salary: '24000.00', faults: 0 },
    ];
    for (const emp of empList) {
      await client.query(`
        INSERT INTO employees (employee_id, pin_hash, name, phone, role, base_salary, fault_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (employee_id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          fault_count = EXCLUDED.fault_count,
          base_salary = EXCLUDED.base_salary;
      `, [emp.id, emp.pin, emp.name, emp.phone, emp.role, emp.salary, emp.faults]);
    }
    console.log('Seeded employees.');

    // B. Vendors
    const vendorList = [
      { id: 'VND-01', name: 'Apex Agro Commodity Exchange', phone: '+919876543210', email: 'sales@apexagro.in', address: 'Grain Mandi Yard 4, Indore', skus: '["SKU-SUGAR-01"]', rate: '40.00' },
      { id: 'VND-02', name: 'Punjab Grain Mandi Suppliers', phone: '+919876543211', email: 'orders@punjabgrains.com', address: 'GT Road Mandi, Ludhiana', skus: '["SKU-RICE-01"]', rate: '85.00' },
      { id: 'VND-03', name: 'Kriti Edible Oils Wholesale', phone: '+919876543212', email: 'dist@kritioils.com', address: 'Industrial Area Phase 2, Dewas', skus: '["SKU-OIL-01"]', rate: '110.00' },
      { id: 'VND-04', name: 'Madhya Bharat Milling Ltd', phone: '+919876543213', email: 'grain@mbmilling.com', address: 'Bhopal Agro Complex', skus: '["SKU-ATTA-01"]', rate: '210.00' },
      { id: 'VND-05', name: 'Deccan Pulse Traders', phone: '+919876543214', email: 'pulses@deccan.in', address: 'APMC Market Yard, Gulbarga', skus: '["SKU-DAL-01"]', rate: '135.00' },
    ];
    for (const v of vendorList) {
      await client.query(`
        INSERT INTO vendors (vendor_id, name, phone, email, address, linked_skus, supply_rate)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (vendor_id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          supply_rate = EXCLUDED.supply_rate;
      `, [v.id, v.name, v.phone, v.email, v.address, v.skus, v.rate]);
    }
    console.log('Seeded vendors.');

    // C. Products Master
    let barcodeSeq = 890100010000;
    const products = [
      {
        skuId: 'SKU-SUGAR-01',
        name: 'SuperMart Premium Refined Sugar 1kg',
        category: 'Staples / Commodities',
        barcode: generateEAN13(barcodeSeq++),
        dailyFluctuationFlag: true,
        targetMarginPct: '15.00',
        minStockThreshold: 30,
        baseWholesaleRate: '40.00',
        costPrice: '40.00',
        sellingPrice: '46.00',
        vendorName: 'Apex Agro Commodity Exchange',
        vendorPhone: '+919876543210',
        dealerId: 'VND-01',
        unitType: '1kg pack',
        minMonthlyTarget: 250,
        flawFlag: false,
        maxCapacityDays: 21,
        leadTimeDays: 3,
        maxLeadTimeDays: 7,
      },
      {
        skuId: 'SKU-RICE-01',
        name: 'SuperMart Royal Basmati Rice 1kg',
        category: 'Staples / Commodities',
        barcode: generateEAN13(barcodeSeq++),
        dailyFluctuationFlag: true,
        targetMarginPct: '18.00',
        minStockThreshold: 25,
        baseWholesaleRate: '85.00',
        costPrice: '85.00',
        sellingPrice: '100.30',
        vendorName: 'Punjab Grain Mandi Suppliers',
        vendorPhone: '+919876543211',
        dealerId: 'VND-02',
        unitType: '1kg pack',
        minMonthlyTarget: 180,
        flawFlag: false,
        maxCapacityDays: 21,
        leadTimeDays: 4,
        maxLeadTimeDays: 8,
      },
      {
        skuId: 'SKU-OIL-01',
        name: 'SuperMart Refined Sunflower Oil 1L',
        category: 'Staples / Commodities',
        barcode: generateEAN13(barcodeSeq++),
        dailyFluctuationFlag: true,
        targetMarginPct: '12.00',
        minStockThreshold: 40,
        baseWholesaleRate: '110.00',
        costPrice: '110.00',
        sellingPrice: '123.20',
        vendorName: 'Kriti Edible Oils Wholesale',
        vendorPhone: '+919876543212',
        dealerId: 'VND-03',
        unitType: '1L pouch',
        minMonthlyTarget: 300,
        flawFlag: false,
        maxCapacityDays: 14,
        leadTimeDays: 2,
        maxLeadTimeDays: 5,
      },
      {
        skuId: 'SKU-ATTA-01',
        name: 'SuperMart Sharbati Whole Wheat Atta 5kg',
        category: 'Flour & Grains',
        barcode: generateEAN13(barcodeSeq++),
        dailyFluctuationFlag: true,
        targetMarginPct: '14.00',
        minStockThreshold: 20,
        baseWholesaleRate: '210.00',
        costPrice: '210.00',
        sellingPrice: '239.40',
        vendorName: 'Madhya Bharat Milling Ltd',
        vendorPhone: '+919876543213',
        dealerId: 'VND-04',
        unitType: '5kg bag',
        minMonthlyTarget: 150,
        flawFlag: false,
        maxCapacityDays: 21,
        leadTimeDays: 3,
        maxLeadTimeDays: 6,
      },
      {
        skuId: 'SKU-DAL-01',
        name: 'SuperMart Unpolished Toor Dal 1kg',
        category: 'Pulses',
        barcode: generateEAN13(barcodeSeq++),
        dailyFluctuationFlag: false,
        targetMarginPct: '16.00',
        minStockThreshold: 20,
        baseWholesaleRate: '135.00',
        costPrice: '135.00',
        sellingPrice: '156.60',
        vendorName: 'Deccan Pulse Traders',
        vendorPhone: '+919876543214',
        dealerId: 'VND-05',
        unitType: '1kg pack',
        minMonthlyTarget: 80,
        flawFlag: true, // Marked as FLAW (Unsold / severely underperforming)
        maxCapacityDays: 21,
        leadTimeDays: 5,
        maxLeadTimeDays: 10,
      },
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO products_master (
          sku_id, name, category, barcode, daily_fluctuation_flag, target_margin_pct,
          min_stock_threshold, base_wholesale_rate, cost_price, selling_price,
          vendor_name, vendor_phone, dealer_id, unit_type, min_monthly_target, flaw_flag,
          max_capacity_days, lead_time_days, max_lead_time_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (sku_id) DO UPDATE SET
          name = EXCLUDED.name,
          barcode = EXCLUDED.barcode,
          cost_price = EXCLUDED.cost_price,
          selling_price = EXCLUDED.selling_price,
          dealer_id = EXCLUDED.dealer_id,
          min_monthly_target = EXCLUDED.min_monthly_target,
          flaw_flag = EXCLUDED.flaw_flag,
          max_capacity_days = EXCLUDED.max_capacity_days,
          lead_time_days = EXCLUDED.lead_time_days,
          max_lead_time_days = EXCLUDED.max_lead_time_days;
      `, [
        p.skuId, p.name, p.category, p.barcode, p.dailyFluctuationFlag, p.targetMarginPct,
        p.minStockThreshold, p.baseWholesaleRate, p.costPrice, p.sellingPrice,
        p.vendorName, p.vendorPhone, p.dealerId, p.unitType, p.minMonthlyTarget, p.flawFlag,
        p.maxCapacityDays, p.leadTimeDays, p.maxLeadTimeDays
      ]);
    }
    console.log('Seeded products_master.');

    // D. Math Metrics Initialization (Formula Verification)
    // Payday Tsunami: Check today's day (1-10 is PEAK, 11-31 is TROUGH)
    const todayDay = new Date().getDate();
    const isPeak = todayDay >= 1 && todayDay <= 10;
    const currentPhase = isPeak ? 'PEAK' : 'TROUGH';

    for (const p of products) {
      const avgSales = isPeak ? 22 : 10;
      const maxSales = isPeak ? 45 : 20;
      const leadTime = p.leadTimeDays;
      const maxLeadTime = p.maxLeadTimeDays;
      // Formula 1: Safety Stock = (Max Daily Sales * Max Lead Time) - (Average Daily Sales * Average Lead Time)
      const safetyStock = Math.max(5, Math.round((maxSales * maxLeadTime) - (avgSales * leadTime)));
      // Formula 2: Reorder Point = (Average Daily Sales * Average Lead Time) + Safety Stock
      const reorderPoint = Math.round((avgSales * leadTime) + safetyStock);
      // Formula 3: Economic Order Quantity / Replenishment = Max Capacity - Current Inventory at ROP
      const maxCapSupply = Math.round(avgSales * p.maxCapacityDays);
      const currInv = 45;
      const orderQty = Math.max(10, maxCapSupply - currInv);
      const reorderAlert = currInv <= reorderPoint;

      await client.query(`
        INSERT INTO sku_math_metrics (
          metric_id, sku_id, avg_daily_sales_peak, avg_daily_sales_trough,
          avg_lead_time_days, max_daily_sales_peak, max_daily_sales_trough,
          max_lead_time_days, current_phase, safety_stock, reorder_point,
          max_capacity_supply, order_quantity, current_inventory, reorder_alert_triggered
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (sku_id) DO UPDATE SET
          current_phase = EXCLUDED.current_phase,
          safety_stock = EXCLUDED.safety_stock,
          reorder_point = EXCLUDED.reorder_point,
          max_capacity_supply = EXCLUDED.max_capacity_supply,
          order_quantity = EXCLUDED.order_quantity,
          current_inventory = EXCLUDED.current_inventory,
          reorder_alert_triggered = EXCLUDED.reorder_alert_triggered,
          last_calculated_at = NOW();
      `, [
        `MATH-${p.skuId}`, p.skuId, 22.0, 10.0,
        leadTime, 45.0, 20.0,
        maxLeadTime, currentPhase, safetyStock, reorderPoint,
        maxCapSupply, orderQty, currInv, reorderAlert
      ]);
    }
    console.log('Seeded SKU math metrics.');

    // E. Supply Chain 3-Way Reconciliation Initial Baseline
    // [A] Units received at 2nd-floor storage
    // [B] Units moved into cartons to ground floor
    // [C] Units sold at POS
    // Current Shelf Stock
    // Balance check: A = B + C + Current Shelf Stock
    const reconList = [
      { sku: 'SKU-SUGAR-01', a: 500, b: 150, c: 315, shelf: 35, mismatch: 0, alert: false },
      { sku: 'SKU-RICE-01', skuName: 'Basmati Rice', a: 300, b: 100, c: 172, shelf: 28, mismatch: 0, alert: false },
      { sku: 'SKU-OIL-01', skuName: 'Sunflower Oil', a: 200, b: 60, c: 118, shelf: 22, mismatch: 0, alert: false },
      { sku: 'SKU-DAL-01', skuName: 'Toor Dal', a: 150, b: 50, c: 75, shelf: 20, mismatch: 5, alert: true }, // Stealing / Shrinkage Alert!
    ];
    for (const r of reconList) {
      await client.query(`
        INSERT INTO supply_chain_reconciliation (
          reconciliation_id, sku_id, units_received_storage_a, units_moved_cartons_b,
          units_sold_pos_c, current_shelf_stock, discrepancy, shrinkage_alert, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (reconciliation_id) DO NOTHING;
      `, [
        `RECON-${r.sku}`, r.sku, r.a, r.b, r.c, r.shelf, r.mismatch, r.alert,
        r.alert ? 'SHRINKAGE_ALERT' : 'VERIFIED',
        r.alert ? 'Mismatch detected: 5 units missing between storage dispatch and shelf sales tally' : '3-Way physical balance verified'
      ]);
    }
    console.log('Seeded Supply Chain 3-Way Reconciliation entries.');

    console.log('\n======================================================');
    console.log('✅ DATABASE SCHEMA & EXTENSIONS FULLY VERIFIED');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Error executing schema sync:', err);
    throw err;
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
