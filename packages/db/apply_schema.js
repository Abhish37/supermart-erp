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
    console.log('Applying table schemas...');
    
    // We drop with CASCADE if existing to ensure fresh, clean schema alignment
    await client.query(`
      DROP TABLE IF EXISTS sales_items CASCADE;
      DROP TABLE IF EXISTS sales_ledger CASCADE;
      DROP TABLE IF EXISTS store_layout CASCADE;
      DROP TABLE IF EXISTS inventory_batches CASCADE;
      DROP TABLE IF EXISTS products_master CASCADE;
      DROP TABLE IF EXISTS financial_overhead CASCADE;
    `);

    const sqlPath = path.resolve(__dirname, 'migrations/0000_lumpy_night_nurse.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await client.query(stmt);
    }
    console.log('All 6 tables, relations, and indexes applied.');

    // Seed Master Data
    console.log('Seeding initial products, batches, store layout, and financial overhead...');

    // 1. Products Master
    const products = [
      {
        skuId: 'SKU-SUGAR-01',
        name: 'SuperMart Premium Refined Sugar 1kg',
        category: 'Staples / Commodities',
        dailyFluctuationFlag: true,
        targetMarginPct: '15.00',
        minStockThreshold: 30,
        baseWholesaleRate: '40.00',
        vendorName: 'Apex Agro Commodity Exchange',
        vendorPhone: '+919876543210',
        unitType: '1kg pack',
      },
      {
        skuId: 'SKU-RICE-01',
        name: 'SuperMart Royal Basmati Rice 1kg',
        category: 'Staples / Commodities',
        dailyFluctuationFlag: true,
        targetMarginPct: '18.00',
        minStockThreshold: 25,
        baseWholesaleRate: '85.00',
        vendorName: 'Punjab Grain Mandi Suppliers',
        vendorPhone: '+919876543211',
        unitType: '1kg pack',
      },
      {
        skuId: 'SKU-OIL-01',
        name: 'SuperMart Refined Sunflower Oil 1L',
        category: 'Staples / Commodities',
        dailyFluctuationFlag: true,
        targetMarginPct: '12.00',
        minStockThreshold: 40,
        baseWholesaleRate: '110.00',
        vendorName: 'Kriti Edible Oils Wholesale',
        vendorPhone: '+919876543212',
        unitType: '1L pouch',
      },
      {
        skuId: 'SKU-ATTA-01',
        name: 'SuperMart Sharbati Whole Wheat Atta 5kg',
        category: 'Flour & Grains',
        dailyFluctuationFlag: true,
        targetMarginPct: '14.00',
        minStockThreshold: 20,
        baseWholesaleRate: '210.00',
        vendorName: 'Madhya Bharat Milling Ltd',
        vendorPhone: '+919876543213',
        unitType: '5kg bag',
      },
      {
        skuId: 'SKU-DAL-01',
        name: 'SuperMart Unpolished Toor Dal 1kg',
        category: 'Pulses',
        dailyFluctuationFlag: false,
        targetMarginPct: '16.00',
        minStockThreshold: 20,
        baseWholesaleRate: '135.00',
        vendorName: 'Deccan Pulse Traders',
        vendorPhone: '+919876543214',
        unitType: '1kg pack',
      },
      {
        skuId: 'SKU-TEA-01',
        name: 'Tata Tea Gold Leaf 500g',
        category: 'Beverages',
        dailyFluctuationFlag: false,
        targetMarginPct: '20.00',
        minStockThreshold: 15,
        baseWholesaleRate: '280.00',
        vendorName: 'Tata Consumer Distributors',
        vendorPhone: '+919876543215',
        unitType: '500g box',
      },
      {
        skuId: 'SKU-BUTTER-01',
        name: 'Amul Pasteurized Butter 500g',
        category: 'Dairy & Refrigerated',
        dailyFluctuationFlag: false,
        targetMarginPct: '10.00',
        minStockThreshold: 20,
        baseWholesaleRate: '240.00',
        vendorName: 'Amul Gujarat Co-op Federation',
        vendorPhone: '+919876543216',
        unitType: '500g pack',
      },
      {
        skuId: 'SKU-BISCUIT-01',
        name: 'Britannia Good Day Butter Cookies 200g',
        category: 'Bakery & Snacks',
        dailyFluctuationFlag: false,
        targetMarginPct: '22.00',
        minStockThreshold: 50,
        baseWholesaleRate: '35.00',
        vendorName: 'Britannia FMCG Regional Depot',
        vendorPhone: '+919876543217',
        unitType: '200g pack',
      },
    ];

    for (const p of products) {
      await client.query(`
        INSERT INTO products_master (
          sku_id, name, category, daily_fluctuation_flag, target_margin_pct,
          min_stock_threshold, base_wholesale_rate, vendor_name, vendor_phone, unit_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        p.skuId, p.name, p.category, p.dailyFluctuationFlag, p.targetMarginPct,
        p.minStockThreshold, p.baseWholesaleRate, p.vendorName, p.vendorPhone, p.unitType
      ]);
    }
    console.log(`Seeded ${products.length} Products in products_master.`);

    // 2. Store Layout (Ground Floor Aisles + 2nd Floor Storage)
    const layouts = [
      { id: 'LAY-01', aisleId: 'Aisle-01', shelfSection: 'Shelf-A1', skuId: 'SKU-SUGAR-01', max: 50, stock: 35, floor: 0 },
      { id: 'LAY-02', aisleId: 'Aisle-01', shelfSection: 'Shelf-A2', skuId: 'SKU-RICE-01', max: 50, stock: 28, floor: 0 },
      { id: 'LAY-03', aisleId: 'Aisle-02', shelfSection: 'Shelf-B1', skuId: 'SKU-OIL-01', max: 40, stock: 22, floor: 0 },
      { id: 'LAY-04', aisleId: 'Aisle-02', shelfSection: 'Shelf-B2', skuId: 'SKU-ATTA-01', max: 30, stock: 18, floor: 0 },
      { id: 'LAY-05', aisleId: 'Aisle-03', shelfSection: 'Shelf-C1', skuId: 'SKU-DAL-01', max: 40, stock: 20, floor: 0 },
      { id: 'LAY-06', aisleId: 'Aisle-03', shelfSection: 'Shelf-C2', skuId: 'SKU-TEA-01', max: 30, stock: 15, floor: 0 },
      { id: 'LAY-07', aisleId: 'Aisle-04', shelfSection: 'Chiller-D1', skuId: 'SKU-BUTTER-01', max: 25, stock: 16, floor: 0 },
      { id: 'LAY-08', aisleId: 'Aisle-04', shelfSection: 'Shelf-D2', skuId: 'SKU-BISCUIT-01', max: 60, stock: 45, floor: 0 },
      // 2nd Floor Private Label Factory Storage Bay
      { id: 'LAY-STORAGE-01', aisleId: '2nd-Floor', shelfSection: 'Bay-Sugar-Bulk', skuId: 'SKU-SUGAR-01', max: 500, stock: 320, floor: 2 },
      { id: 'LAY-STORAGE-02', aisleId: '2nd-Floor', shelfSection: 'Bay-Rice-Bulk', skuId: 'SKU-RICE-01', max: 500, stock: 250, floor: 2 },
    ];

    for (const l of layouts) {
      await client.query(`
        INSERT INTO store_layout (
          id, aisle_id, shelf_section, sku_id, max_shelf_capacity, current_shelf_stock, floor_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [l.id, l.aisleId, l.shelfSection, l.skuId, l.max, l.stock, l.floor]);
    }
    console.log(`Seeded ${layouts.length} Store layout coordinates.`);

    // 3. Inventory Batches (FIFO Enforced with unique EAN-13 barcodes)
    // Sugar batches (Both Shelf and Storage)
    let barcodeSeq = 890100010000;
    
    // Batch 1 (Older arrival date - FIFO 1st priority)
    const sugarOldBarcode = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '10 days', 40.00, 46.00, 'Shelf', 20, 1.000)
    `, ['BATCH-SUGAR-FIFO-01', 'SKU-SUGAR-01', sugarOldBarcode]);

    // Batch 2 (Newer arrival date - FIFO 2nd priority in 2nd-floor storage)
    const sugarNewBarcode = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg, parent_bulk_batch_id
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '2 days', 40.00, 46.00, 'Storage', 48, 1.000, 'BULK-SACK-50KG-01')
    `, ['BATCH-SUGAR-FIFO-02', 'SKU-SUGAR-01', sugarNewBarcode]);

    // Rice batches
    const riceBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '8 days', 85.00, 100.30, 'Shelf', 28, 1.000)
    `, ['BATCH-RICE-01', 'SKU-RICE-01', riceBarcode1]);

    // Oil batches
    const oilBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '5 days', 110.00, 123.20, 'Shelf', 22, 1.000)
    `, ['BATCH-OIL-01', 'SKU-OIL-01', oilBarcode1]);

    // Atta batches
    const attaBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '6 days', 210.00, 239.40, 'Shelf', 18, 5.000)
    `, ['BATCH-ATTA-01', 'SKU-ATTA-01', attaBarcode1]);

    // Dal batches
    const dalBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '12 days', 135.00, 156.60, 'Shelf', 20, 1.000)
    `, ['BATCH-DAL-01', 'SKU-DAL-01', dalBarcode1]);

    // Tea batches
    const teaBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '4 days', 280.00, 336.00, 'Shelf', 15, 0.500)
    `, ['BATCH-TEA-01', 'SKU-TEA-01', teaBarcode1]);

    // Butter batches
    const butterBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '3 days', 240.00, 264.00, 'Shelf', 16, 0.500)
    `, ['BATCH-BUTTER-01', 'SKU-BUTTER-01', butterBarcode1]);

    // Biscuits batches
    const biscuitBarcode1 = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '15 days', 35.00, 42.70, 'Shelf', 45, 0.200)
    `, ['BATCH-BISCUIT-01', 'SKU-BISCUIT-01', biscuitBarcode1]);

    // Dead Stock batch example (25 days unsold)
    const deadStockBarcode = generateEAN13(barcodeSeq++);
    await client.query(`
      INSERT INTO inventory_batches (
        batch_id, sku_id, barcode, arrival_date, cost_price, current_selling_price, status, quantity, unit_weight_kg
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '25 days', 135.00, 156.60, 'Shelf', 12, 1.000)
    `, ['BATCH-DEAD-DAL-01', 'SKU-DAL-01', deadStockBarcode]);

    console.log('Seeded FIFO Inventory batches with valid EAN-13 barcodes.');

    // 4. Financial Overhead Baseline (Amortized daily rent, electricity, salaries, spillage)
    const overheads = [
      { id: 'OVH-RENT-01', cat: 'Rent', amount: 3500.00, notes: 'Daily amortized store lease (Ground floor + 2nd floor warehouse)' },
      { id: 'OVH-ELEC-01', cat: 'Electricity', amount: 1200.00, notes: 'Daily commercial power & cold storage chiller load' },
      { id: 'OVH-SALARY-01', cat: 'Salary', amount: 4800.00, notes: 'Daily staff payroll (4 cashiers, 2 floor managers, 2 warehouse loaders)' },
      { id: 'OVH-SPILL-01', cat: 'Spillage', amount: 80.00, notes: 'Process spillage: 2kg lost during 50kg bulk-to-unit sugar repackaging' },
    ];

    for (const o of overheads) {
      await client.query(`
        INSERT INTO financial_overhead (
          overhead_id, expense_category, amount, expense_date, notes
        ) VALUES ($1, $2, $3, NOW(), $4)
      `, [o.id, o.cat, o.amount, o.notes]);
    }
    console.log('Seeded Financial Overhead expense ledger.');

    // Print Barcode Reference Map for POS Testing
    console.log('\n======================================================');
    console.log('       READY-TO-SCAN EAN-13 BARCODES FOR POS TESTING   ');
    console.log('======================================================');
    console.log(`Sugar 1kg (Shelf):    ${sugarOldBarcode}  (Price: Rs 46.00)`);
    console.log(`Sugar 1kg (Storage):  ${sugarNewBarcode}  (Price: Rs 46.00)`);
    console.log(`Basmati Rice 1kg:     ${riceBarcode1}  (Price: Rs 100.30)`);
    console.log(`Sunflower Oil 1L:     ${oilBarcode1}  (Price: Rs 123.20)`);
    console.log(`Wheat Atta 5kg:       ${attaBarcode1}  (Price: Rs 239.40)`);
    console.log(`Toor Dal 1kg:         ${dalBarcode1}  (Price: Rs 156.60)`);
    console.log(`Tata Tea Gold 500g:   ${teaBarcode1}  (Price: Rs 336.00)`);
    console.log(`Amul Butter 500g:     ${butterBarcode1}  (Price: Rs 264.00)`);
    console.log(`Good Day Cookies:     ${biscuitBarcode1}  (Price: Rs 42.70)`);
    console.log(`Dead Stock Batch:     ${deadStockBarcode}  (Arrived 25 days ago)`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('Error during migration & seeding:', err);
    throw err;
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
