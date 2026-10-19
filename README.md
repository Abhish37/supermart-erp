# SuperMart ERP & High-Velocity POS

A high-velocity, real-time Supermarket POS and ERP system engineered to handle peak-load checkout volume during the "Payday Tsunami" with strict owner-controlled financial compliance.

---

## Architecture & Tech Stack

```
                        +---------------------------------------------+
                        |   Next.js 14 POS & Owner Dashboard UI       |
                        |   (Ultra-clean, monochrome, high contrast)  |
                        +----------------------+----------------------+
                                               |
                          REST API & WebSockets| (Syncs 15-20 POS Computers)
                                               v
                        +---------------------------------------------+
                        |        FastAPI Core Asynchronous Service     |
                        +-----------+---------------------+-----------+
                                    |                     |
               Atomic ACID Ledger   |                     | 800ms Scan Debounce &
               Transactions         v                     v Real-time Stock Lock
                        +---------------------+ +---------------------+
                        | Render PostgreSQL   | | Upstash / Valkey    |
                        | (Drizzle ORM Schema)| | Redis Cluster       |
                        +---------------------+ +---------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
    +--------------------------------+ +--------------------------------+
    | ReportLab PDF PO Generator     | | 2nd-Floor Private Label Factory|
    | & WhatsApp Cloud API Dispatch  | | (Bulk-to-Unit Spillage Loss)   |
    +--------------------------------+ +--------------------------------+
```

* **Frontend**: Next.js 14 with TypeScript, Tailwind CSS, high-contrast monochrome design, WebSockets.
* **Backend**: Python 3.14 with FastAPI, asynchronous real-time WebSockets, ReportLab PDF generator.
* **Database**: PostgreSQL (Render cloud instance) with Drizzle ORM schema and strict ACID transactions.
* **Caching & Queueing**: Redis with sub-millisecond in-memory fallback for 800ms scan debouncing.
* **Automated Supply Chain**: ReportLab PDF Purchase Order generator & WhatsApp Cloud API verification.

---

## Key Workflows & Features

### 1. High-Velocity POS Terminal (`/`)
* **800ms Scan Debounce Shield**: Redis drops duplicate scans of the exact same EAN-13 within 800ms, preventing double-billing on rapid scanner triggers.
* **Atomic Checkout Transaction**: Complete ACID transaction locking batch inventory, inserting ledger records, calculating exact COGS, and decrementing shelf stock.
* **Strict Post-Checkout Void Rule**: Individual items **cannot** be unbilled post-checkout; the entire invoice must be voided and regenerated with a mandatory audit reason.
* **Instant WebSocket Sync**: Real-time broadcast pushes price updates and inventory adjustments to all 15–20 active POS terminals concurrently without page reload.

### 2. Owner-Controlled Financial Dashboard (`/dashboard`)
* **True Net Profit Ledger**:
  $$\text{Net Profit} = \text{Revenue} - \text{COGS} - \text{Amortized Rent} - \text{Electricity} - \text{Payroll} - \text{Process Spillage}$$
* **3-Way Inventory Velocity Classification**:
  1. *High-Velocity (Fast Selling)*: Top sales velocity items.
  2. *Steady Sellers*: Regular shelf movement.
  3. *Dead Stock (20+ Days Unsold)*: Automatic alert with tied-capital metrics and clearance discount recommendation (-15% to -25%).
* **Physical Store Layout Mapping**: Visualizes Ground Floor aisles (Aisles 1–4, Chiller D1) and 2nd-Floor Private Label Bulk Storage with real-time capacity meters.
* **Dynamic Commodity Pricing Engine**: Select Sugar, Rice, Oil, or Atta, enter wholesale mandi rate, and immediately push recalculated retail prices to all POS terminals via WebSockets.

### 3. Bulk-to-Unit Repackaging Studio (`/repackage`)
* **Factory Floor Conversion**: Converts 50kg bulk sacks into 1kg consumer packets.
* **Mathematical Process Spillage Accounting**: Automatically calculates missing weight ($50\text{kg} - 48\text{kg} = 2\text{kg}$), computes financial loss ($2\text{kg} \times \text{Rate} = \text{₹}80.00$), and records it directly into `financial_overhead` under category `Spillage`.
* **Unique EAN-13 Barcodes**: Generates standard GS1 Modulo-10 checksum-verified barcodes for the output yield.

### 4. Smart Replenishment & Purchase Orders (`/replenishment`)
* **Payday Tsunami 1.5x Dynamic Buffer**: Automatically escalates reorder buffer thresholds by 1.5x during the 1st–10th of every month.
* **Floor Manager FIFO Shelf Routing**: When a shelf falls below capacity, alerts tablet with exact shelf coordinates and the oldest FIFO batch ID to pull from 2nd-floor storage.
* **ReportLab PDF Purchase Orders**: Automatically generates formal, printable Purchase Orders with Vendor Name, Phone, and SKU details.
* **WhatsApp Cloud API Dispatch**: Sends the generated PDF download link directly to the owner's WhatsApp for one-click verification.

---

## Local Development & Setup

### 1. Database Setup (Drizzle ORM)
```bash
cd packages/db
npm install
node apply_schema.js
```

### 2. Backend Service (FastAPI)
```bash
cd backend
# Activate virtual environment
.venv\Scripts\activate   # Windows
# or source .venv/bin/activate # Linux/Mac

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend App (Next.js 14)
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
