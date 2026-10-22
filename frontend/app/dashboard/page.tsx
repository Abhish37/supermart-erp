"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  Download,
  Layers,
  Users,
  Building,
  DollarSign,
  Package,
  Calendar,
  ShieldAlert,
  CheckCircle,
  Truck,
  RotateCcw,
  Edit2,
  Check,
  RefreshCw,
  Clock,
  Sparkles,
  Search,
  ExternalLink
} from "lucide-react";

interface FinancialOverview {
  revenue: number;
  transaction_count: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  overheads: {
    amortized_rent: number;
    electricity: number;
    staff_salary: number;
    process_spillage: number;
    maintenance: number;
    total_overhead: number;
  };
  net_profit: number;
  net_margin_pct: number;
}

interface ShelfItem {
  id: string;
  aisle_id: string;
  shelf_section: string;
  sku_id: string;
  product_name: string;
  category: string;
  max_shelf_capacity: number;
  current_shelf_stock: number;
  floor_level: number;
  sales_velocity_score: string;
  performance_status: "HIGH_VELOCITY" | "STEADY" | "LOW_VELOCITY";
  cost_price: string;
  selling_price: string;
  vendor_name: string;
  min_stock_threshold?: number;
  min_monthly_target: number;
  flaw_flag: boolean;
  sample_barcode: string;
  oldest_batch_days_unsold: number;
}

interface Employee {
  employee_id: string;
  name: string;
  phone: string;
  address: string;
  role: string;
  base_salary: number;
  bonuses: number;
  total_deductions: number;
  net_payable: number;
  fault_count: number;
  fault_badge: "NORMAL" | "YELLOW" | "RED";
  active: boolean;
}

interface Vendor {
  vendor_id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  supply_rate: string;
}

interface ReorderItem {
  reorder_id: string;
  po_number: string;
  vendor_id: string;
  vendor_name: string;
  vendor_phone: string;
  sku_id: string;
  product_name: string;
  reorder_qty: number;
  unit_cost: string;
  total_cost: string;
  status: "SUGGESTED" | "ORDERED" | "ARRIVED";
  trigger_reason: string;
  created_at: string;
}

interface MathMetric {
  metric_id: string;
  sku_id: string;
  product_name: string;
  category: string;
  avg_daily_sales_peak: string;
  avg_daily_sales_trough: string;
  avg_lead_time_days: string;
  max_daily_sales_peak: string;
  max_daily_sales_trough: string;
  max_lead_time_days: string;
  current_phase: string;
  safety_stock: number;
  reorder_point: number;
  max_capacity_supply: number;
  order_quantity: number;
  current_inventory: number;
  reorder_alert_triggered: boolean;
}

interface ThreeWayRecon {
  reconciliation_id: string;
  sku_id: string;
  product_name: string;
  units_received_storage_a: number;
  units_moved_cartons_b: number;
  units_sold_pos_c: number;
  current_shelf_stock: number;
  discrepancy: number;
  shrinkage_alert: boolean;
  status: string;
  notes: string;
}

export default function AdminOwnerDashboard() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Navigation tab
  const [activeTab, setActiveTab] = useState<
    "spatial_map" | "financials" | "dead_stock" | "employees" | "reorder" | "supply_chain" | "math_engine"
  >("spatial_map");

  // Loading
  const [loading, setLoading] = useState(true);

  // Data states
  const [financials, setFinancials] = useState<FinancialOverview | null>(null);
  const [dateFilter, setDateFilter] = useState<"Today" | "This Week" | "This Month">("This Month");
  const [shelves, setShelves] = useState<ShelfItem[]>([]);
  const [selectedShelfSection, setSelectedShelfSection] = useState<string>("ALL");
  const [drilldownShelf, setDrilldownShelf] = useState<string | null>(null);

  // Velocity & Dead Stock
  const [velocityData, setVelocityData] = useState<any | null>(null);
  const [editingCostPriceSku, setEditingCostPriceSku] = useState<string | null>(null);
  const [tempCostPrice, setTempCostPrice] = useState("");

  // Employees & Cash Tally
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tallyTerminal, setTallyTerminal] = useState("POS-01");
  const [tallyCashierId, setTallyCashierId] = useState("EMP-101");
  const [tallyPhysicalCash, setTallyPhysicalCash] = useState("");
  const [tallyResult, setTallyResult] = useState<any | null>(null);

  // Deductions Modal
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [deductEmpId, setDeductEmpId] = useState("");
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("Cash Mishandling");
  const [deductNotes, setDeductNotes] = useState("");

  // Reorder & Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [reorders, setReorders] = useState<ReorderItem[]>([]);

  // Supply Chain 3-Way
  const [threeWayList, setThreeWayList] = useState<ThreeWayRecon[]>([]);
  const [reconSku, setReconSku] = useState("SKU-DAL-01");
  const [reconA, setReconA] = useState("150");
  const [reconB, setReconB] = useState("50");
  const [reconResult, setReconResult] = useState<any | null>(null);

  // Math Engine
  const [mathData, setMathData] = useState<any | null>(null);

  useEffect(() => {
    loadAllData();
  }, [dateFilter]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [finRes, layoutRes, velRes, empRes, vndRes, reorderRes, threeRes, mathRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/net-profit`),
        fetch(`${API_URL}/api/store/layout`),
        fetch(`${API_URL}/api/analytics/velocity`),
        fetch(`${API_URL}/api/employees/list`),
        fetch(`${API_URL}/api/supply-chain/vendors`),
        fetch(`${API_URL}/api/supply-chain/reorder-queue`),
        fetch(`${API_URL}/api/supply-chain/reconciliations`),
        fetch(`${API_URL}/api/math/metrics`),
      ]);

      if (finRes.ok) setFinancials(await finRes.json());
      if (layoutRes.ok) setShelves(await layoutRes.json());
      if (velRes.ok) setVelocityData(await velRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
      if (vndRes.ok) setVendors(await vndRes.json());
      if (reorderRes.ok) setReorders(await reorderRes.json());
      if (threeRes.ok) setThreeWayList(await threeRes.json());
      if (mathRes.ok) setMathData(await mathRes.json());
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  // 1. Interactive Floor Plan Filter & Drilldown
  const uniqueShelfSections = Array.from(new Set(shelves.map((s) => s.shelf_section)));
  const groundFloorShelves = shelves.filter((s) => s.floor_level === 0);
  const displayedShelves =
    selectedShelfSection === "ALL"
      ? groundFloorShelves
      : groundFloorShelves.filter((s) => s.shelf_section === selectedShelfSection);

  // 2. Cost Price Update
  const handleSaveCostPrice = async (skuId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/products/${skuId}/cost-price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_price: parseFloat(tempCostPrice) }),
      });
      if (res.ok) {
        setEditingCostPriceSku(null);
        loadAllData();
      }
    } catch (e) {
      alert("Failed to update cost price");
    }
  };

  // 3. End of Day Cash Tally
  const handleRunCashTally = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/employees/cash-tally`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos_terminal_id: tallyTerminal,
          cashier_id: tallyCashierId,
          physical_cash: parseFloat(tallyPhysicalCash),
        }),
      });
      const data = await res.json();
      setTallyResult(data);
      loadAllData();
    } catch (e) {
      alert("Cash reconciliation failed");
    }
  };

  // 4. Employee Deduction
  const handleAddDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/employees/deductions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: deductEmpId,
          amount: parseFloat(deductAmount),
          reason: deductReason,
          notes: deductNotes,
        }),
      });
      if (res.ok) {
        setShowDeductionModal(false);
        setDeductAmount("");
        setDeductNotes("");
        loadAllData();
      }
    } catch (e) {
      alert("Failed to log deduction");
    }
  };

  // 5. Reorder Status Change
  const handleUpdateOrderStatus = async (reorderId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/supply-chain/reorder/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder_id: reorderId, status: newStatus }),
      });
      if (res.ok) loadAllData();
    } catch (e) {
      alert("Failed to update order status");
    }
  };

  // 6. 3-Way Check
  const handleRunThreeWayCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/supply-chain/three-way-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: reconSku,
          units_received_storage_a: parseInt(reconA, 10),
          units_moved_cartons_b: parseInt(reconB, 10),
        }),
      });
      const data = await res.json();
      setReconResult(data);
      loadAllData();
    } catch (e) {
      alert("3-way check failed");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER & DATE RANGE FILTER */}
      <div className="bg-white p-6 rounded-lg border border-zinc-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-zinc-950 uppercase">
              SUPERMART OWNER & OPERATIONS CONTROL CENTER
            </h1>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold uppercase">
              LIVE MASTER
            </span>
          </div>
          <p className="text-xs text-zinc-500 font-mono mt-1">
            Store GST: 07AAAAA0000A1Z5 &bull; FSSAI: 10019011000123 &bull; Tier-3 Indian City Edge Hub
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-md border border-zinc-200 text-xs font-mono">
            {(["Today", "This Week", "This Month"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDateFilter(tab)}
                className={`px-3 py-1.5 rounded transition-colors ${
                  dateFilter === tab ? "bg-black text-white font-bold shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Download Formal PDF Report Button */}
          <a
            href={`${API_URL}/api/financial/download-pdf?date_filter=${encodeURIComponent(dateFilter)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-mono font-bold transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>DOWNLOAD PDF AUDIT</span>
          </a>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-zinc-200 overflow-x-auto pb-1 text-xs font-mono uppercase tracking-wider">
        {[
          { key: "spatial_map", label: "2D Floor Plan (Spatial Map)", icon: Layers },
          { key: "financials", label: "Financial Ledger & Margin", icon: DollarSign },
          { key: "dead_stock", label: "Inventory & Flaws (20+ Days)", icon: AlertOctagon },
          { key: "employees", label: "Employee Faults & Cash Tally", icon: Users },
          { key: "reorder", label: "Reorder Book & Vendors", icon: Truck },
          { key: "supply_chain", label: "3-Way Reconciliation", icon: ShieldAlert },
          { key: "math_engine", label: "Math Engine (Payday Tsunami)", icon: Sparkles },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t font-bold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === key
                ? "border-black text-black bg-white shadow-xs"
                : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 1. INTERACTIVE 2D FLOOR PLAN (THE SPATIAL MAP)                           */}
      {/* ========================================================================= */}
      {activeTab === "spatial_map" && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black font-mono uppercase text-zinc-900">
                GROUND FLOOR 2D SPATIAL STORE MAP
              </h2>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Shelves glow with a <span className="font-bold text-emerald-600">Green Border</span> for high velocity
                and a <span className="font-bold text-red-600">Red Border</span> for low sales. Click shelf to drill
                down.
              </p>
            </div>

            {/* Dropdown selects different shelves */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-500">FILTER SHELF:</span>
              <select
                value={selectedShelfSection}
                onChange={(e) => {
                  setSelectedShelfSection(e.target.value);
                  setDrilldownShelf(null);
                }}
                className="px-3 py-1.5 border border-zinc-300 rounded font-mono font-bold bg-white text-zinc-900 focus:outline-none"
              >
                <option value="ALL">ALL GROUND SHELVES</option>
                {uniqueShelfSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2D Interactive Floor Layout Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {displayedShelves.map((item) => {
              const isHighVelocity =
                item.performance_status === "HIGH_VELOCITY" || parseFloat(item.sales_velocity_score) >= 1.5;
              const isLowVelocity =
                item.performance_status === "LOW_VELOCITY" || parseFloat(item.sales_velocity_score) < 0.8;
              const isDrilledDown = drilldownShelf === item.id;

              // Glowing Border: Green for high, Red for low, zinc for steady
              const borderGlowClass = isHighVelocity
                ? "border-emerald-500 ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/10"
                : isLowVelocity
                ? "border-red-500 ring-2 ring-red-400 shadow-lg shadow-red-500/10"
                : "border-zinc-300";

              return (
                <div
                  key={item.id}
                  onClick={() => setDrilldownShelf(isDrilledDown ? null : item.id)}
                  className={`bg-white rounded-lg p-5 border-2 transition-all cursor-pointer relative ${
                    isDrilledDown ? "border-zinc-900 shadow-xl" : borderGlowClass
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        {item.aisle_id}
                      </span>
                      <h3 className="font-mono font-black text-base text-zinc-900">{item.shelf_section}</h3>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                        isHighVelocity
                          ? "bg-emerald-100 text-emerald-800"
                          : isLowVelocity
                          ? "bg-red-100 text-red-800"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {item.performance_status}
                    </span>
                  </div>

                  {/* Stock Bar */}
                  <div className="mt-4 space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-zinc-600">
                      <span>Stock:</span>
                      <span className="font-bold text-zinc-900">
                        {item.current_shelf_stock} / {item.max_shelf_capacity}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full ${
                          item.current_shelf_stock <= (item.min_stock_threshold || 10) ? "bg-amber-500" : "bg-zinc-800"
                        }`}
                        style={{
                          width: `${Math.min(100, (item.current_shelf_stock / item.max_shelf_capacity) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* PRODUCT DRILLDOWN (Clicking a shelf removes shelf border and highlights individual products) */}
                  {isDrilledDown ? (
                    <div className="mt-4 pt-3 border-t border-zinc-200 space-y-2 animate-fadeIn">
                      <div className="text-[11px] font-mono font-bold text-zinc-500 uppercase">
                        PRODUCT DRILLDOWN:
                      </div>

                      {/* Product Box: Products unsold for 5-10 days get a Red Box */}
                      <div
                        className={`p-3 rounded border-2 text-xs font-mono ${
                          item.oldest_batch_days_unsold >= 5
                            ? "border-red-600 bg-red-50 text-red-950 ring-2 ring-red-400"
                            : "border-zinc-300 bg-zinc-50 text-zinc-900"
                        }`}
                      >
                        <div className="font-bold text-sm">{item.product_name}</div>
                        <div className="text-[11px] mt-1 space-y-0.5">
                          <div>SKU: {item.sku_id}</div>
                          <div>Retail Price: ₹{parseFloat(item.selling_price).toFixed(2)}</div>
                          <div>Barcode: {item.sample_barcode}</div>
                          <div className="font-bold mt-1">
                            Oldest Batch Age: {item.oldest_batch_days_unsold} Days Unsold
                          </div>
                        </div>

                        {item.oldest_batch_days_unsold >= 5 && (
                          <div className="mt-2 text-[10px] font-bold text-red-700 uppercase bg-red-100 p-1 rounded">
                            ⚠️ RED BOX ALERT: Unsold for {item.oldest_batch_days_unsold} days! Recommend shelf rotation
                            or clearance.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
                      <span className="truncate">{item.product_name}</span>
                      <span className="text-blue-600 font-bold shrink-0">Drilldown &rarr;</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FINANCIAL LEDGER & REVENUE ANALYTICS                                   */}
      {/* ========================================================================= */}
      {activeTab === "financials" && financials && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            {/* Total Revenue */}
            <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-xs">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-bold">TOTAL REVENUE</span>
              <div className="text-2xl font-black text-zinc-950 mt-1">₹{financials.revenue.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-1">{financials.transaction_count} Completed Bills</div>
            </div>

            {/* COGS & Blended Gross Margin */}
            <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-xs">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-bold">COST OF GOODS SOLD (COGS)</span>
              <div className="text-2xl font-black text-zinc-950 mt-1">₹{financials.cogs.toLocaleString()}</div>
              <div className="text-xs text-emerald-600 font-bold mt-1">
                Blended Gross Margin: {financials.gross_margin_pct}%
              </div>
            </div>

            {/* Fixed Costs */}
            <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-xs">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-bold">TOTAL FIXED COSTS</span>
              <div className="text-2xl font-black text-zinc-950 mt-1">
                ₹{financials.overheads.total_overhead.toLocaleString()}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Rent, Payroll, Power, Hardware</div>
            </div>

            {/* True Net Profit */}
            <div
              className={`p-5 rounded-lg border shadow-xs ${
                financials.net_profit >= 0
                  ? "bg-emerald-950 text-white border-emerald-800"
                  : "bg-red-950 text-white border-red-800"
              }`}
            >
              <span className="text-xs text-zinc-400 uppercase tracking-wider font-bold">TRUE STORE NET PROFIT</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">₹{financials.net_profit.toLocaleString()}</div>
              <div className="text-xs text-zinc-400 mt-1">Net Margin: {financials.net_margin_pct}%</div>
            </div>
          </div>

          {/* Itemized Fixed Costs Breakdown */}
          <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-xs space-y-4">
            <h3 className="text-sm font-black font-mono uppercase text-zinc-900">
              ITEMIZED FIXED OVERHEAD LEDGER ({dateFilter.toUpperCase()})
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-zinc-500">Amortized Rent:</span>
                <div className="font-bold text-sm text-zinc-900 mt-0.5">
                  ₹{financials.overheads.amortized_rent.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-zinc-500">Staff Salaries:</span>
                <div className="font-bold text-sm text-zinc-900 mt-0.5">
                  ₹{financials.overheads.staff_salary.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-zinc-500">Commercial Power:</span>
                <div className="font-bold text-sm text-zinc-900 mt-0.5">
                  ₹{financials.overheads.electricity.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-zinc-500">Process Spillage:</span>
                <div className="font-bold text-sm text-amber-700 mt-0.5">
                  ₹{financials.overheads.process_spillage.toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-zinc-500">Hardware & Misc:</span>
                <div className="font-bold text-sm text-zinc-900 mt-0.5">
                  ₹{financials.overheads.maintenance.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. INVENTORY & DEAD STOCK ALERTS                                          */}
      {/* ========================================================================= */}
      {activeTab === "dead_stock" && (
        <div className="space-y-6">
          {/* Velocity Lists: Fast Sellers, Steady Sellers, Dead Stock */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            {/* Fast Sellers */}
            <div className="bg-emerald-50/60 p-4 rounded-lg border border-emerald-200">
              <div className="flex items-center gap-2 font-bold text-emerald-900 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>FAST SELLERS (HIGH VELOCITY)</span>
              </div>
              <p className="text-emerald-800 text-[11px] mb-3">Top sales turnarounds during current phase.</p>
              <div className="space-y-1.5">
                {(velocityData?.high_velocity || []).slice(0, 4).map((i: any) => (
                  <div key={i.batch_id} className="p-2 bg-white rounded border border-emerald-200 flex justify-between">
                    <span className="font-bold text-zinc-900">{i.name}</span>
                    <span className="text-emerald-700 font-bold">{i.units_sold} sold</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Steady Sellers */}
            <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200">
              <div className="flex items-center gap-2 font-bold text-zinc-800 mb-2">
                <RotateCcw className="w-4 h-4 text-zinc-600" />
                <span>STEADY SELLERS</span>
              </div>
              <p className="text-zinc-600 text-[11px] mb-3">Consistent baseline shelf movement.</p>
              <div className="space-y-1.5">
                {(velocityData?.steady_sellers || []).slice(0, 4).map((i: any) => (
                  <div key={i.batch_id} className="p-2 bg-white rounded border border-zinc-200 flex justify-between">
                    <span className="font-bold text-zinc-900">{i.name}</span>
                    <span className="text-zinc-700 font-bold">{i.units_sold} sold</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dead Stock (20+ Days Unsold - Marked Red) */}
            <div className="bg-red-50/70 p-4 rounded-lg border border-red-300">
              <div className="flex items-center gap-2 font-bold text-red-950 mb-2">
                <AlertOctagon className="w-4 h-4 text-red-600" />
                <span>DEAD STOCK ALERT (20+ DAYS UNSOLD)</span>
              </div>
              <p className="text-red-800 text-[11px] mb-3">Capital tied up. Immediate clearance required.</p>
              <div className="space-y-1.5">
                {(velocityData?.dead_stock || []).map((i: any) => (
                  <div key={i.batch_id} className="p-2.5 bg-white rounded border-2 border-red-500 space-y-1">
                    <div className="font-black text-red-900 flex justify-between">
                      <span>{i.name}</span>
                      <span>{i.days_in_store} DAYS</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 flex justify-between">
                      <span>Tied Capital: ₹{i.tied_capital}</span>
                      <span className="text-red-700 font-bold">Rec. Disc: -{i.recommended_discount_pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Product Master Table: Barcode, Qty, Cost Price (Editable), Selling Price, Dealer Name, Min Monthly Target */}
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 bg-zinc-900 text-white flex items-center justify-between font-mono text-xs">
              <span className="font-bold uppercase tracking-wider">
                PRODUCT MASTER & FLAW FLAGGING TABLE (INLINE EDITABLE COST PRICE)
              </span>
              <span className="text-zinc-400">{shelves.length} Products Monitored</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs divide-y divide-zinc-200">
                <thead className="bg-zinc-100 text-zinc-600 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">BARCODE / SKU</th>
                    <th className="px-4 py-2.5">PRODUCT NAME</th>
                    <th className="px-4 py-2.5 text-right">QTY AVAIL</th>
                    <th className="px-4 py-2.5 text-right">COST PRICE</th>
                    <th className="px-4 py-2.5 text-right">SELLING PRICE</th>
                    <th className="px-4 py-2.5">DEALER NAME</th>
                    <th className="px-4 py-2.5 text-center">MONTHLY TARGET</th>
                    <th className="px-4 py-2.5 text-center">STATUS / FLAW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {shelves.map((item) => {
                    const isFlaw =
                      item.flaw_flag || item.oldest_batch_days_unsold >= 20 || item.current_shelf_stock < 5;
                    const isEditing = editingCostPriceSku === item.sku_id;

                    return (
                      <tr key={item.sku_id} className={isFlaw ? "bg-red-50/50" : "hover:bg-zinc-50"}>
                        <td className="px-4 py-3">
                          <div className="font-bold text-zinc-900">{item.sample_barcode}</div>
                          <div className="text-[10px] text-zinc-500">{item.sku_id}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-zinc-900">{item.product_name}</td>
                        <td className="px-4 py-3 text-right font-bold text-zinc-900">
                          {item.current_shelf_stock} pcs
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={tempCostPrice}
                                onChange={(e) => setTempCostPrice(e.target.value)}
                                className="w-16 px-1.5 py-0.5 border border-black rounded text-right font-bold"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveCostPrice(item.sku_id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingCostPriceSku(item.sku_id);
                                setTempCostPrice(item.cost_price);
                              }}
                              className="cursor-pointer group flex items-center justify-end gap-1 text-zinc-800 font-bold hover:text-black"
                              title="Click to edit Cost Price"
                            >
                              <span>₹{parseFloat(item.cost_price).toFixed(2)}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-zinc-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          ₹{parseFloat(item.selling_price).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{item.vendor_name}</td>
                        <td className="px-4 py-3 text-center text-zinc-700 font-bold">
                          {item.min_monthly_target} units
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isFlaw ? (
                            <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] uppercase tracking-wider animate-pulse">
                              FLAW: REVIEW
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px]">
                              NORMAL
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. EMPLOYEE MANAGEMENT & CASH RECONCILIATION                             */}
      {/* ========================================================================= */}
      {activeTab === "employees" && (
        <div className="space-y-6">
          {/* Top: End of Day Cash Tally Form */}
          <div className="bg-zinc-900 text-white p-5 rounded-lg border border-zinc-800 shadow-xs">
            <h3 className="font-mono font-black text-sm uppercase text-emerald-400 mb-1">
              END OF DAY CASH TALLY & DRAWER DISCREPANCY RECONCILIATION
            </h3>
            <p className="text-xs text-zinc-400 font-mono mb-4">
              Cashier enters physical cash counted in drawer. System subtracts the ₹3,000 opening buffer. If Physical
              Cash != System Cash, discrepancy is logged directly to cashier profile for deduction.
            </p>

            <form onSubmit={handleRunCashTally} className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">TERMINAL:</label>
                <select
                  value={tallyTerminal}
                  onChange={(e) => setTallyTerminal(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 rounded text-white focus:outline-none"
                >
                  {[
                    { id: "POS-01", label: "POS-1 (Lane 1)" },
                    { id: "POS-02", label: "POS-2 (Lane 2)" },
                    { id: "POS-03", label: "POS-3 (Lane 3)" },
                    { id: "POS-04", label: "POS-4 (Lane 4)" },
                    { id: "POS-05", label: "POS-5 (Lane 5)" },
                    { id: "POS-06", label: "POS-6 (Lane 6)" },
                    { id: "POS-07", label: "POS-7 (Lane 7)" },
                    { id: "POS-08", label: "POS-8 (Lane 8)" },
                    { id: "POS-09", label: "POS-9 (Lane 9)" },
                    { id: "POS-10", label: "POS-10 (Lane 10)" },
                  ].map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">CASHIER:</label>
                <select
                  value={tallyCashierId}
                  onChange={(e) => setTallyCashierId(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 rounded text-white focus:outline-none"
                >
                  {employees.map((e) => (
                    <option key={e.employee_id} value={e.employee_id}>
                      {e.name} [{e.employee_id}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">TOTAL PHYSICAL CASH IN DRAWER (₹):</label>
                <input
                  type="number"
                  value={tallyPhysicalCash}
                  onChange={(e) => setTallyPhysicalCash(e.target.value)}
                  placeholder="e.g. 15450"
                  required
                  className="w-full px-3 py-2 bg-black border border-emerald-500 rounded text-emerald-300 font-bold focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-bold uppercase rounded tracking-wider shadow-xs"
                >
                  VERIFY & AUDIT TALLY
                </button>
              </div>
            </form>

            {/* Reconciliation Result Notification */}
            {tallyResult && (
              <div
                className={`mt-4 p-4 rounded text-xs font-mono border ${
                  tallyResult.is_balanced
                    ? "bg-emerald-950/80 border-emerald-700 text-emerald-300"
                    : "bg-red-950/80 border-red-700 text-red-300"
                }`}
              >
                <div className="font-bold text-sm">{tallyResult.message}</div>
                <div className="mt-1 text-[11px] space-x-4">
                  <span>Physical Entered: ₹{tallyResult.physical_cash_entered}</span>
                  <span>Less ₹3,000 Buffer = ₹{tallyResult.net_physical_cash}</span>
                  <span>System Cash Expected = ₹{tallyResult.system_cash_expected}</span>
                  <span className="font-bold underline">Discrepancy: ₹{tallyResult.discrepancy}</span>
                </div>
              </div>
            )}
          </div>

          {/* Employee Profiles with Fault Counter */}
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 bg-zinc-100 border-b border-zinc-200 flex items-center justify-between font-mono text-xs">
              <span className="font-bold uppercase text-zinc-800">
                EMPLOYEE PROFILES & DISCIPLINARY FAULT TRACKER
              </span>
              <span className="text-zinc-500">Fault Legend: &gt;3 Yellow (Warning), &gt;5 Red (Severe)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs divide-y divide-zinc-200">
                <thead className="bg-zinc-50 text-zinc-600 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">ID / NAME</th>
                    <th className="px-4 py-2.5">PHONE</th>
                    <th className="px-4 py-2.5">BASE SALARY</th>
                    <th className="px-4 py-2.5">BONUSES</th>
                    <th className="px-4 py-2.5">DEDUCTIONS</th>
                    <th className="px-4 py-2.5">NET PAYABLE</th>
                    <th className="px-4 py-2.5 text-center">FAULT COUNTER</th>
                    <th className="px-4 py-2.5 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {employees.map((emp) => (
                    <tr key={emp.employee_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-bold text-zinc-900">
                        <div>{emp.name}</div>
                        <div className="text-[10px] text-zinc-500 font-normal">{emp.employee_id}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{emp.phone}</td>
                      <td className="px-4 py-3 text-zinc-800">₹{emp.base_salary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-emerald-700">₹{emp.bonuses.toLocaleString()}</td>
                      <td className="px-4 py-3 text-red-600 font-bold">₹{emp.total_deductions.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-zinc-950">₹{emp.net_payable.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-black text-[11px] uppercase tracking-wider ${
                            emp.fault_badge === "RED"
                              ? "bg-red-600 text-white animate-pulse"
                              : emp.fault_badge === "YELLOW"
                              ? "bg-amber-400 text-black font-bold"
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {emp.fault_count} FAULTS
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setDeductEmpId(emp.employee_id);
                            setShowDeductionModal(true);
                          }}
                          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[10px] font-bold"
                        >
                          + DEDUCT
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. REORDER BOOK & VENDOR MANAGEMENT                                      */}
      {/* ========================================================================= */}
      {activeTab === "reorder" && (
        <div className="space-y-6">
          {/* Reorder Queue */}
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 bg-zinc-900 text-white flex items-center justify-between font-mono text-xs">
              <span className="font-bold uppercase tracking-wider">
                AUTOMATED REORDER QUEUE & PURCHASE ORDERS (GRN)
              </span>
              <span className="text-zinc-400">{reorders.length} Orders in Queue</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs divide-y divide-zinc-200">
                <thead className="bg-zinc-100 text-zinc-600 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">PO NUMBER</th>
                    <th className="px-4 py-2.5">ITEM NAME / SKU</th>
                    <th className="px-4 py-2.5">VENDOR NAME</th>
                    <th className="px-4 py-2.5 text-right">REORDER QTY</th>
                    <th className="px-4 py-2.5 text-right">UNIT COST</th>
                    <th className="px-4 py-2.5 text-right">TOTAL EST</th>
                    <th className="px-4 py-2.5 text-center">STATUS</th>
                    <th className="px-4 py-2.5 text-center">WORKFLOW ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {reorders.map((po) => (
                    <tr key={po.reorder_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-bold text-zinc-900">{po.po_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-zinc-900">{po.product_name}</div>
                        <div className="text-[10px] text-zinc-500">{po.sku_id}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{po.vendor_name}</td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-900">{po.reorder_qty} units</td>
                      <td className="px-4 py-3 text-right text-zinc-700">₹{parseFloat(po.unit_cost).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-950">
                        ₹{parseFloat(po.total_cost).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            po.status === "SUGGESTED"
                              ? "bg-amber-100 text-amber-900"
                              : po.status === "ORDERED"
                              ? "bg-blue-100 text-blue-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {po.status === "SUGGESTED" && (
                          <button
                            onClick={() => handleUpdateOrderStatus(po.reorder_id, "ORDERED")}
                            className="px-3 py-1 bg-black hover:bg-zinc-800 text-white rounded text-[10px] font-bold"
                          >
                            PLACE ORDER &rarr;
                          </button>
                        )}
                        {po.status === "ORDERED" && (
                          <button
                            onClick={() => handleUpdateOrderStatus(po.reorder_id, "ARRIVED")}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold"
                          >
                            RECEIVE (GRN) &rarr;
                          </button>
                        )}
                        {po.status === "ARRIVED" && (
                          <span className="text-[10px] text-emerald-700 font-bold">✓ INVENTORY STACKED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. SUPPLY CHAIN & 3-WAY RECONCILIATION                                   */}
      {/* ========================================================================= */}
      {activeTab === "supply_chain" && (
        <div className="space-y-6">
          <div className="bg-zinc-900 text-white p-5 rounded-lg border border-zinc-800 shadow-xs">
            <h3 className="font-mono font-black text-sm uppercase text-amber-400 mb-1">
              THE 3-WAY RECONCILIATION ENGINE: A = B + C + CURRENT SHELF STOCK
            </h3>
            <p className="text-xs text-zinc-400 font-mono mb-4">
              [A] Units received at 2nd-floor storage &bull; [B] Units scanned into cartons for ground floor &bull; [C]
              Units sold at POS. Any deficit triggers an immediate Stealing/Shrinkage Alert.
            </p>

            <form
              onSubmit={handleRunThreeWayCheck}
              className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-xs"
            >
              <div>
                <label className="block text-zinc-400 mb-1">SELECT SKU:</label>
                <select
                  value={reconSku}
                  onChange={(e) => setReconSku(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 rounded text-white focus:outline-none"
                >
                  <option value="SKU-SUGAR-01">Premium Sugar 1kg</option>
                  <option value="SKU-RICE-01">Royal Basmati Rice 1kg</option>
                  <option value="SKU-DAL-01">Toor Dal 1kg (Shrinkage Example)</option>
                  <option value="SKU-OIL-01">Sunflower Oil 1L</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">[A] STORAGE RECEIVED UNITS:</label>
                <input
                  type="number"
                  value={reconA}
                  onChange={(e) => setReconA(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 rounded text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">[B] CARTONS DISPATCHED:</label>
                <input
                  type="number"
                  value={reconB}
                  onChange={(e) => setReconB(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-zinc-700 rounded text-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase rounded tracking-wider shadow-xs"
                >
                  AUDIT 3-WAY BALANCE
                </button>
              </div>
            </form>

            {reconResult && (
              <div
                className={`mt-4 p-4 rounded text-xs font-mono border ${
                  reconResult.shrinkage_alert
                    ? "bg-red-950/80 border-red-700 text-red-300 animate-pulse"
                    : "bg-emerald-950/80 border-emerald-700 text-emerald-300"
                }`}
              >
                <div className="font-bold text-sm">{reconResult.message}</div>
                <div className="mt-1 text-[11px] space-x-3">
                  <span>Received A: {reconResult.storage_received_a}</span>
                  <span>Moved B: {reconResult.cartons_moved_b}</span>
                  <span>Sold C: {reconResult.pos_units_sold_c}</span>
                  <span>Shelf Stock: {reconResult.current_shelf_stock}</span>
                  <span className="font-bold underline">Discrepancy: {reconResult.discrepancy} Units</span>
                </div>
              </div>
            )}
          </div>

          {/* Past 3-Way Reconciliations List */}
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3 bg-zinc-100 border-b border-zinc-200 font-mono text-xs font-bold uppercase text-zinc-800">
              AUDIT TRAIL LOGS
            </div>
            <div className="divide-y divide-zinc-100 font-mono text-xs">
              {threeWayList.map((r) => (
                <div key={r.reconciliation_id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-zinc-900">{r.product_name}</div>
                    <div className="text-[11px] text-zinc-500">{r.notes}</div>
                  </div>
                  <div>
                    {r.shrinkage_alert ? (
                      <span className="px-2.5 py-1 bg-red-600 text-white font-bold rounded text-[10px] uppercase">
                        🚨 SHRINKAGE ALERT ({r.discrepancy} MISSING)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px] uppercase">
                        ✓ VERIFIED
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MATH ENGINE (PAYDAY TSUNAMI & ROP FORMULAS)                            */}
      {/* ========================================================================= */}
      {activeTab === "math_engine" && mathData && (
        <div className="space-y-6">
          <div className="bg-zinc-950 text-white p-6 rounded-lg border border-zinc-800 font-mono">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-emerald-400 font-bold uppercase tracking-widest">
                  CURRENT SYSTEM PHASE: {mathData.current_phase} (DAY {mathData.day_of_month})
                </span>
                <h2 className="text-xl font-black mt-1">THE PAYDAY TSUNAMI ADJUSTMENT ENGINE</h2>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">{mathData.phase_description}</p>
              </div>

              <div className="text-right">
                <span className="text-3xl font-black text-amber-400">{mathData.alerts_triggered_count}</span>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider">ROP BREACH ALERTS</div>
              </div>
            </div>
          </div>

          {/* Formulas Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(mathData.metrics || []).map((m: MathMetric) => (
              <div
                key={m.sku_id}
                className={`bg-white rounded-lg p-5 border-2 font-mono text-xs space-y-3 ${
                  m.reorder_alert_triggered ? "border-amber-500 bg-amber-50/20" : "border-zinc-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900">{m.product_name}</h3>
                    <div className="text-[11px] text-zinc-500">{m.category}</div>
                  </div>
                  {m.reorder_alert_triggered ? (
                    <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold uppercase animate-pulse">
                      REORDER ALERT
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      IN STOCK
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-zinc-50 rounded border border-zinc-200">
                  <div>Safety Stock: <span className="font-bold">{m.safety_stock} units</span></div>
                  <div>Reorder Point (ROP): <span className="font-bold">{m.reorder_point} units</span></div>
                  <div>Current Inventory: <span className="font-bold text-blue-700">{m.current_inventory} units</span></div>
                  <div>Order Qty: <span className="font-bold text-emerald-700">{m.order_quantity} units</span></div>
                </div>

                <div className="text-[10px] text-zinc-500 space-y-0.5">
                  <div>
                    Safety Stock = (Max Sales &times; Max Lead) - (Avg Sales &times; Avg Lead)
                  </div>
                  <div>
                    ROP = (Avg Sales &times; Avg Lead) + Safety Stock
                  </div>
                  <div className="font-bold text-zinc-700">
                    Condition: Current ({m.current_inventory}) &le; ROP ({m.reorder_point}) &rarr;{" "}
                    {m.reorder_alert_triggered ? "REORDER QUEUED" : "OPTIMAL"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEDUCTION MODAL */}
      {showDeductionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddDeduction}
            className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-5 font-mono text-xs space-y-4"
          >
            <div className="font-bold text-sm uppercase text-zinc-900">
              LOG EMPLOYEE DEDUCTION ({deductEmpId})
            </div>

            <div>
              <label className="block text-zinc-500 mb-1">DEDUCTION AMOUNT (₹):</label>
              <input
                type="number"
                value={deductAmount}
                onChange={(e) => setDeductAmount(e.target.value)}
                placeholder="e.g. 500"
                required
                className="w-full px-3 py-2 border rounded font-bold"
              />
            </div>

            <div>
              <label className="block text-zinc-500 mb-1">REASON DROPDOWN (MANDATORY):</label>
              <select
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                className="w-full px-3 py-2 border rounded font-bold"
              >
                <option value="Cash Mishandling">Cash Mishandling</option>
                <option value="Leave">Leave</option>
                <option value="Product Damage">Product Damage</option>
                <option value="Rude Behavior">Rude Behavior</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-500 mb-1">AUDIT NOTES:</label>
              <input
                type="text"
                value={deductNotes}
                onChange={(e) => setDeductNotes(e.target.value)}
                placeholder="Reason notes..."
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowDeductionModal(false)}
                className="px-3 py-1.5 bg-zinc-200 rounded font-bold text-zinc-700"
              >
                CANCEL
              </button>
              <button type="submit" className="px-4 py-1.5 bg-black text-white rounded font-bold">
                CONFIRM DEDUCTION
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
