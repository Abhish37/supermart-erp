import {
  pgTable,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =========================================================================
// 1. PRODUCTS MASTER
// =========================================================================
export const productsMaster = pgTable(
  "products_master",
  {
    skuId: text("sku_id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    barcode: text("barcode"), // Primary Master Barcode
    dailyFluctuationFlag: boolean("daily_fluctuation_flag").default(false).notNull(),
    targetMarginPct: numeric("target_margin_pct", { precision: 5, scale: 2 }).notNull().default("15.00"),
    minStockThreshold: integer("min_stock_threshold").notNull().default(20),
    baseWholesaleRate: numeric("base_wholesale_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
    costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
    sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }).notNull().default("0.00"),
    vendorName: text("vendor_name").default("Apex Agro Wholesale"),
    vendorPhone: text("vendor_phone").default("+919876543210"),
    dealerId: text("dealer_id"),
    unitType: text("unit_type").default("kg"),
    minMonthlyTarget: integer("min_monthly_target").notNull().default(100),
    flawFlag: boolean("flaw_flag").default(false).notNull(), // Flagged for 20+ days unsold or severely underperforming
    maxCapacityDays: integer("max_capacity_days").notNull().default(21), // E.g., 21-day supply
    leadTimeDays: integer("lead_time_days").notNull().default(3), // Average Lead Time in Days
    maxLeadTimeDays: integer("max_lead_time_days").notNull().default(7), // Max Lead Time for Delayed Delivery
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_products_category").on(table.category),
    index("idx_products_fluctuation").on(table.dailyFluctuationFlag),
    index("idx_products_barcode").on(table.barcode),
    index("idx_products_flaw").on(table.flawFlag),
  ]
);

// =========================================================================
// 2. INVENTORY BATCHES (FIFO ENFORCEMENT & EAN-13 BARCODES)
// =========================================================================
export const inventoryBatches = pgTable(
  "inventory_batches",
  {
    batchId: text("batch_id").primaryKey(),
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId, { onDelete: "cascade" }),
    barcode: text("barcode").notNull().unique(), // EAN-13
    arrivalDate: timestamp("arrival_date", { withTimezone: true }).defaultNow().notNull(), // CRITICAL for FIFO
    costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
    currentSellingPrice: numeric("current_selling_price", { precision: 10, scale: 2 }).notNull(),
    status: text("status").notNull().default("Storage"), // 'Storage', 'Shelf', 'Sold'
    quantity: integer("quantity").notNull().default(1),
    unitWeightKg: numeric("unit_weight_kg", { precision: 8, scale: 3 }).notNull().default("1.000"),
    parentBulkBatchId: text("parent_bulk_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_batches_sku").on(table.skuId),
    index("idx_batches_status").on(table.status),
    index("idx_batches_fifo").on(table.skuId, table.status, table.arrivalDate),
    uniqueIndex("idx_batches_barcode").on(table.barcode),
  ]
);

// =========================================================================
// 3. STORE LAYOUT (PHYSICAL GROUND FLOOR & 2ND FLOOR STORAGE)
// =========================================================================
export const storeLayout = pgTable(
  "store_layout",
  {
    id: text("id").primaryKey(),
    aisleId: text("aisle_id").notNull(), // e.g., 'Aisle-01', 'Aisle-02'
    shelfSection: text("shelf_section").notNull(), // e.g., 'Shelf-A1', 'Chiller-D1'
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId, { onDelete: "cascade" }),
    maxShelfCapacity: integer("max_shelf_capacity").notNull().default(100),
    currentShelfStock: integer("current_shelf_stock").notNull().default(0),
    floorLevel: integer("floor_level").notNull().default(0), // 0: Retail Ground Floor, 2: 2nd-Floor Private Label Storage
    salesVelocityScore: numeric("sales_velocity_score", { precision: 8, scale: 2 }).notNull().default("1.00"),
    performanceStatus: text("performance_status").notNull().default("STEADY"), // 'HIGH_VELOCITY', 'STEADY', 'LOW_VELOCITY'
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_store_layout_sku").on(table.skuId),
    index("idx_store_layout_aisle").on(table.aisleId),
    index("idx_store_layout_section").on(table.shelfSection),
  ]
);

// =========================================================================
// 4. EMPLOYEES & FAULT COUNTER
// =========================================================================
export const employees = pgTable(
  "employees",
  {
    employeeId: text("employee_id").primaryKey(), // e.g., 'EMP-101'
    pinHash: text("pin_hash").notNull(), // 4-6 digit cashier PIN
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address").default("SuperMart Staff Quarters"),
    role: text("role").notNull().default("CASHIER"), // 'CASHIER', 'FLOOR_MANAGER', 'ADMIN'
    baseSalary: numeric("base_salary", { precision: 10, scale: 2 }).notNull().default("18000.00"),
    bonuses: numeric("bonuses", { precision: 10, scale: 2 }).notNull().default("0.00"),
    faultCount: integer("fault_count").notNull().default(0), // >3 Yellow, >5 Red
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_employees_fault").on(table.faultCount),
  ]
);

// =========================================================================
// 5. EMPLOYEE DEDUCTIONS & REASONS
// =========================================================================
export const employeeDeductions = pgTable(
  "employee_deductions",
  {
    deductionId: text("deduction_id").primaryKey(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(), // 'Leave', 'Cash Mishandling', 'Product Damage', 'Rude Behavior'
    deductionDate: timestamp("deduction_date", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_deductions_employee").on(table.employeeId),
    index("idx_deductions_reason").on(table.reason),
  ]
);

// =========================================================================
// 6. END OF DAY CASH RECONCILIATION
// =========================================================================
export const cashReconciliations = pgTable(
  "cash_reconciliations",
  {
    reconciliationId: text("reconciliation_id").primaryKey(),
    posTerminalId: text("pos_terminal_id").notNull(),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => employees.employeeId),
    openingBuffer: numeric("opening_buffer", { precision: 10, scale: 2 }).notNull().default("3000.00"), // Fixed 3,000 INR buffer
    physicalCash: numeric("physical_cash", { precision: 10, scale: 2 }).notNull(),
    systemCash: numeric("system_cash", { precision: 10, scale: 2 }).notNull(),
    discrepancy: numeric("discrepancy", { precision: 10, scale: 2 }).notNull(), // (physical - buffer) - system
    deductionLogged: boolean("deduction_logged").notNull().default(false),
    notes: text("notes"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_cash_recon_terminal").on(table.posTerminalId),
    index("idx_cash_recon_cashier").on(table.cashierId),
    index("idx_cash_recon_time").on(table.reconciledAt),
  ]
);

// =========================================================================
// 7. DEALERS / VENDORS
// =========================================================================
export const vendors = pgTable(
  "vendors",
  {
    vendorId: text("vendor_id").primaryKey(), // e.g., 'VND-01'
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    linkedSkus: text("linked_skus"), // JSON string array of SKU IDs
    supplyRate: numeric("supply_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// =========================================================================
// 8. REORDER QUEUE & PURCHASE ORDERS (GRN)
// =========================================================================
export const reorderQueue = pgTable(
  "reorder_queue",
  {
    reorderId: text("reorder_id").primaryKey(),
    poNumber: text("po_number").notNull().unique(), // e.g., 'PO-20261022-001'
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.vendorId),
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId),
    reorderQty: integer("reorder_qty").notNull(),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("SUGGESTED"), // 'SUGGESTED', 'ORDERED', 'ARRIVED' (GRN)
    triggerReason: text("trigger_reason").notNull().default("ROP_BREACH"), // 'ROP_BREACH', 'PAYDAY_TSUNAMI_PEAK', 'MANUAL'
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_reorder_status").on(table.status),
    index("idx_reorder_sku").on(table.skuId),
  ]
);

// =========================================================================
// 9. THE MATH ENGINE METRICS (DYNAMIC PER SKU & PAYDAY TSUNAMI ADJUSTMENT)
// =========================================================================
export const skuMathMetrics = pgTable(
  "sku_math_metrics",
  {
    metricId: text("metric_id").primaryKey(),
    skuId: text("sku_id")
      .notNull()
      .unique()
      .references(() => productsMaster.skuId, { onDelete: "cascade" }),
    // Tracking Variables
    avgDailySalesPeak: numeric("avg_daily_sales_peak", { precision: 10, scale: 2 }).notNull().default("15.00"), // 1st to 10th
    avgDailySalesTrough: numeric("avg_daily_sales_trough", { precision: 10, scale: 2 }).notNull().default("7.00"), // 11th to 30th
    avgLeadTimeDays: numeric("avg_lead_time_days", { precision: 5, scale: 2 }).notNull().default("3.00"),
    maxDailySalesPeak: numeric("max_daily_sales_peak", { precision: 10, scale: 2 }).notNull().default("35.00"),
    maxDailySalesTrough: numeric("max_daily_sales_trough", { precision: 10, scale: 2 }).notNull().default("15.00"),
    maxLeadTimeDays: numeric("max_lead_time_days", { precision: 5, scale: 2 }).notNull().default("6.00"),
    // Dynamic Formulas
    currentPhase: text("current_phase").notNull().default("TROUGH"), // 'PEAK' (1st-10th) or 'TROUGH' (11th-31st)
    safetyStock: integer("safety_stock").notNull().default(20), // (Max Daily Sales * Max Lead Time) - (Avg Daily Sales * Avg Lead Time)
    reorderPoint: integer("reorder_point").notNull().default(40), // (Avg Daily Sales * Avg Lead Time) + Safety Stock
    maxCapacitySupply: integer("max_capacity_supply").notNull().default(150), // 21-day supply target
    orderQuantity: integer("order_quantity").notNull().default(110), // Max Capacity - Current Inventory at ROP
    currentInventory: integer("current_inventory").notNull().default(50),
    reorderAlertTriggered: boolean("reorder_alert_triggered").notNull().default(false), // Current Inventory <= ROP
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_math_reorder_alert").on(table.reorderAlertTriggered),
  ]
);

// =========================================================================
// 10. SUPPLY CHAIN & 3-WAY RECONCILIATION
// =========================================================================
export const supplyChainReconciliation = pgTable(
  "supply_chain_reconciliation",
  {
    reconciliationId: text("reconciliation_id").primaryKey(),
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId),
    batchId: text("batch_id"),
    unitsReceivedStorageA: integer("units_received_storage_a").notNull().default(0), // [A] Units received at 2nd-floor storage
    unitsMovedCartonsB: integer("units_moved_cartons_b").notNull().default(0), // [B] Units scanned into cartons to Ground Floor
    unitsSoldPosc: integer("units_sold_pos_c").notNull().default(0), // [C] Units sold at POS
    currentShelfStock: integer("current_shelf_stock").notNull().default(0), // Real-time ground floor shelf count
    discrepancy: integer("discrepancy").notNull().default(0), // A - (B + C + currentShelfStock) or similar mismatch
    shrinkageAlert: boolean("shrinkage_alert").notNull().default(false), // Stealing/Shrinkage Alert!
    status: text("status").notNull().default("VERIFIED"), // 'VERIFIED', 'SHRINKAGE_ALERT'
    notes: text("notes"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_supply_shrinkage").on(table.shrinkageAlert),
    index("idx_supply_sku").on(table.skuId),
  ]
);

// =========================================================================
// 11. PINELABS TERMINAL HARDWARE LOGS (ACID TWO-PHASE COMMIT)
// =========================================================================
export const pinelabsTerminalLogs = pgTable(
  "pinelabs_terminal_logs",
  {
    requestId: text("request_id").primaryKey(), // Unique hardware request ID
    posTerminalId: text("pos_terminal_id").notNull(),
    transactionId: text("transaction_id"),
    paymentMode: text("payment_mode").notNull(), // 'UPI', 'Card'
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("INITIATED"), // 'INITIATED', 'WAITING_DEVICE', 'SUCCESS', 'FAILED'
    deviceRrn: text("device_rrn"), // Retrieval Reference Number from POS terminal
    responsePayload: text("response_payload"), // Full JSON from PineLabs terminal
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_pinelabs_status").on(table.status),
    index("idx_pinelabs_txn").on(table.transactionId),
  ]
);

// =========================================================================
// 12. SALES LEDGER (ATOMIC BILLING TRANSACTIONS)
// =========================================================================
export const salesLedger = pgTable(
  "sales_ledger",
  {
    transactionId: text("transaction_id").primaryKey(), // Bill / Txn Number
    posTerminalId: text("pos_terminal_id").notNull(), // e.g., 'POS-01'
    cashierId: text("cashier_id").notNull().default("EMP-101"), // Bound employee
    cashierName: text("cashier_name").notNull().default("Ramesh Kumar"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    roundedAmount: numeric("rounded_amount", { precision: 12, scale: 2 }).notNull(), // Rounded for cash, exact for UPI/Card
    paymentMode: text("payment_mode").notNull().default("Cash"), // 'Cash', 'UPI', 'Card'
    paymentRefId: text("payment_ref_id"), // PineLabs Txn ID or UPI RRN
    status: text("status").notNull().default("COMPLETED"), // 'COMPLETED', 'VOIDED'
    voidedReason: text("voided_reason"),
    syncStatus: text("sync_status").notNull().default("LOCAL_COMMITTED"), // 'LOCAL_COMMITTED', 'CLOUD_SYNCED'
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sales_ledger_pos").on(table.posTerminalId),
    index("idx_sales_ledger_timestamp").on(table.timestamp),
    index("idx_sales_ledger_status").on(table.status),
    index("idx_sales_ledger_sync").on(table.syncStatus),
  ]
);

// =========================================================================
// 13. SALES ITEMS (LINE ITEMS LINKED TO BATCH FOR EXACT PROFIT / COGS)
// =========================================================================
export const salesItems = pgTable(
  "sales_items",
  {
    itemId: text("item_id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => salesLedger.transactionId, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => inventoryBatches.batchId),
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId),
    sellingPriceAtTime: numeric("selling_price_at_time", { precision: 10, scale: 2 }).notNull(),
    cogs: numeric("cogs", { precision: 10, scale: 2 }).notNull(), // Cost of Goods Sold for exact margin
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    index("idx_sales_items_tx").on(table.transactionId),
    index("idx_sales_items_sku").on(table.skuId),
    index("idx_sales_items_batch").on(table.batchId),
  ]
);

// =========================================================================
// 14. FINANCIAL OVERHEAD (EXPENSES & SPILLAGE LOSS ACCOUNTING)
// =========================================================================
export const financialOverhead = pgTable(
  "financial_overhead",
  {
    overheadId: text("overhead_id").primaryKey(),
    expenseCategory: text("expense_category").notNull(), // 'Rent', 'Salary', 'Electricity', 'Spillage', 'Hardware', 'Software', 'Misc'
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    expenseDate: timestamp("expense_date", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_financial_category").on(table.expenseCategory),
    index("idx_financial_date").on(table.expenseDate),
  ]
);

// =========================================================================
// 15. OFFLINE-FIRST ASYNC CLOUD SYNC QUEUE
// =========================================================================
export const cloudSyncQueue = pgTable(
  "cloud_sync_queue",
  {
    queueId: text("queue_id").primaryKey(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    operation: text("operation").notNull(), // 'INSERT', 'UPDATE', 'DELETE'
    payload: text("payload").notNull(), // JSON serialized
    syncStatus: text("sync_status").notNull().default("PENDING"), // 'PENDING', 'SYNCED', 'FAILED'
    retryCount: integer("retry_count").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_sync_queue_status").on(table.syncStatus),
  ]
);

// =========================================================================
// RELATIONS
// =========================================================================
export const productsRelations = relations(productsMaster, ({ many, one }) => ({
  batches: many(inventoryBatches),
  locations: many(storeLayout),
  salesItems: many(salesItems),
  reorders: many(reorderQueue),
  mathMetrics: one(skuMathMetrics, {
    fields: [productsMaster.skuId],
    references: [skuMathMetrics.skuId],
  }),
}));

export const batchesRelations = relations(inventoryBatches, ({ one, many }) => ({
  product: one(productsMaster, {
    fields: [inventoryBatches.skuId],
    references: [productsMaster.skuId],
  }),
  salesItems: many(salesItems),
}));

export const salesLedgerRelations = relations(salesLedger, ({ many }) => ({
  items: many(salesItems),
}));

export const salesItemsRelations = relations(salesItems, ({ one }) => ({
  ledger: one(salesLedger, {
    fields: [salesItems.transactionId],
    references: [salesLedger.transactionId],
  }),
  batch: one(inventoryBatches, {
    fields: [salesItems.batchId],
    references: [inventoryBatches.batchId],
  }),
  product: one(productsMaster, {
    fields: [salesItems.skuId],
    references: [productsMaster.skuId],
  }),
}));

export const employeeRelations = relations(employees, ({ many }) => ({
  deductions: many(employeeDeductions),
  reconciliations: many(cashReconciliations),
}));
