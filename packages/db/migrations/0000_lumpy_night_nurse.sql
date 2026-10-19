CREATE TABLE "financial_overhead" (
	"overhead_id" text PRIMARY KEY NOT NULL,
	"expense_category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"batch_id" text PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"barcode" text NOT NULL,
	"arrival_date" timestamp with time zone DEFAULT now() NOT NULL,
	"cost_price" numeric(10, 2) NOT NULL,
	"current_selling_price" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'Storage' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_weight_kg" numeric(8, 3) DEFAULT '1.000' NOT NULL,
	"parent_bulk_batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone,
	CONSTRAINT "inventory_batches_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "products_master" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"daily_fluctuation_flag" boolean DEFAULT false NOT NULL,
	"target_margin_pct" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"min_stock_threshold" integer DEFAULT 20 NOT NULL,
	"base_wholesale_rate" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"vendor_name" text DEFAULT 'Apex Agro Wholesale',
	"vendor_phone" text DEFAULT '+919876543210',
	"unit_type" text DEFAULT 'kg',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_items" (
	"item_id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"selling_price_at_time" numeric(10, 2) NOT NULL,
	"cogs" numeric(10, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_ledger" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"pos_terminal_id" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"payment_mode" text DEFAULT 'UPI' NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"voided_reason" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_layout" (
	"id" text PRIMARY KEY NOT NULL,
	"aisle_id" text NOT NULL,
	"shelf_section" text NOT NULL,
	"sku_id" text NOT NULL,
	"max_shelf_capacity" integer DEFAULT 100 NOT NULL,
	"current_shelf_stock" integer DEFAULT 0 NOT NULL,
	"floor_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_sku_id_products_master_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."products_master"("sku_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_transaction_id_sales_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."sales_ledger"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_batch_id_inventory_batches_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_sku_id_products_master_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."products_master"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_layout" ADD CONSTRAINT "store_layout_sku_id_products_master_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."products_master"("sku_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_financial_category" ON "financial_overhead" USING btree ("expense_category");--> statement-breakpoint
CREATE INDEX "idx_financial_date" ON "financial_overhead" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "idx_batches_sku" ON "inventory_batches" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "idx_batches_status" ON "inventory_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_batches_fifo" ON "inventory_batches" USING btree ("sku_id","status","arrival_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_batches_barcode" ON "inventory_batches" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products_master" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_products_fluctuation" ON "products_master" USING btree ("daily_fluctuation_flag");--> statement-breakpoint
CREATE INDEX "idx_sales_items_tx" ON "sales_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_sales_items_sku" ON "sales_items" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "idx_sales_items_batch" ON "sales_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_sales_ledger_pos" ON "sales_ledger" USING btree ("pos_terminal_id");--> statement-breakpoint
CREATE INDEX "idx_sales_ledger_timestamp" ON "sales_ledger" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_sales_ledger_status" ON "sales_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_layout_sku" ON "store_layout" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "idx_store_layout_aisle" ON "store_layout" USING btree ("aisle_id");