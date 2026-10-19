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

// 1. PRODUCTS MASTER
export const productsMaster = pgTable(
  "products_master",
  {
    skuId: text("sku_id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    dailyFluctuationFlag: boolean("daily_fluctuation_flag").default(false).notNull(),
    targetMarginPct: numeric("target_margin_pct", { precision: 5, scale: 2 }).notNull().default("15.00"),
    minStockThreshold: integer("min_stock_threshold").notNull().default(20),
    baseWholesaleRate: numeric("base_wholesale_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
    vendorName: text("vendor_name").default("Apex Agro Wholesale"),
    vendorPhone: text("vendor_phone").default("+919876543210"),
    unitType: text("unit_type").default("kg"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_products_category").on(table.category),
    index("idx_products_fluctuation").on(table.dailyFluctuationFlag),
  ]
);

// 2. INVENTORY BATCHES (FIFO ENFORCEMENT)
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

// 3. STORE LAYOUT (PHYSICAL GROUND FLOOR & 2ND FLOOR STORAGE)
export const storeLayout = pgTable(
  "store_layout",
  {
    id: text("id").primaryKey(),
    aisleId: text("aisle_id").notNull(), // e.g., 'Aisle-01', 'Aisle-02'
    shelfSection: text("shelf_section").notNull(), // e.g., 'Shelf-A3', 'Bay-2B'
    skuId: text("sku_id")
      .notNull()
      .references(() => productsMaster.skuId, { onDelete: "cascade" }),
    maxShelfCapacity: integer("max_shelf_capacity").notNull().default(100),
    currentShelfStock: integer("current_shelf_stock").notNull().default(0),
    floorLevel: integer("floor_level").notNull().default(0), // 0: Retail Ground Floor, 2: 2nd-Floor Private Label Storage
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_store_layout_sku").on(table.skuId),
    index("idx_store_layout_aisle").on(table.aisleId),
  ]
);

// 4. SALES LEDGER (ATOMIC BILLING TRANSACTIONS)
export const salesLedger = pgTable(
  "sales_ledger",
  {
    transactionId: text("transaction_id").primaryKey(),
    posTerminalId: text("pos_terminal_id").notNull(), // e.g., 'POS-01', 'POS-15'
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    paymentMode: text("payment_mode").notNull().default("UPI"), // 'UPI', 'Cash', 'Card'
    status: text("status").notNull().default("COMPLETED"), // 'COMPLETED', 'VOIDED'
    voidedReason: text("voided_reason"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sales_ledger_pos").on(table.posTerminalId),
    index("idx_sales_ledger_timestamp").on(table.timestamp),
    index("idx_sales_ledger_status").on(table.status),
  ]
);

// 5. SALES ITEMS (LINE ITEMS LINKED TO BATCH FOR EXACT PROFIT / COGS)
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

// 6. FINANCIAL OVERHEAD (EXPENSES & SPILLAGE LOSS ACCOUNTING)
export const financialOverhead = pgTable(
  "financial_overhead",
  {
    overheadId: text("overhead_id").primaryKey(),
    expenseCategory: text("expense_category").notNull(), // 'Rent', 'Salary', 'Electricity', 'Spillage', 'Maintenance'
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

// RELATIONS
export const productsRelations = relations(productsMaster, ({ many }) => ({
  batches: many(inventoryBatches),
  locations: many(storeLayout),
  salesItems: many(salesItems),
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
