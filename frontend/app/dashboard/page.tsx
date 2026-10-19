"use client";

import React, { useState, useEffect } from "react";

interface Financials {
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

interface CommodityItem {
  sku_id: string;
  name: string;
  category: string;
  daily_fluctuation_flag: boolean;
  target_margin_pct: string;
  base_wholesale_rate: string;
  current_retail_price: number;
}

interface StoreCoordinate {
  id: string;
  aisle_id: string;
  shelf_section: string;
  sku_id: string;
  product_name: string;
  max_shelf_capacity: number;
  current_shelf_stock: number;
  floor_level: number;
  selling_price: number;
  sample_barcode: string;
}

export default function OwnerDashboardPage() {
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [velocityData, setVelocityData] = useState<{
    high_velocity: any[];
    steady_sellers: any[];
    dead_stock: any[];
    summary: any;
  } | null>(null);
  const [commodities, setCommodities] = useState<CommodityItem[]>([]);
  const [storeLayout, setStoreLayout] = useState<StoreCoordinate[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Pricing Module state
  const [selectedSku, setSelectedSku] = useState("SKU-SUGAR-01");
  const [newWholesaleRate, setNewWholesaleRate] = useState("42.00");
  const [pricingStatus, setPricingStatus] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [profitRes, velRes, commRes, layoutRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/net-profit`),
        fetch(`${API_URL}/api/analytics/velocity`),
        fetch(`${API_URL}/api/pricing/commodities`),
        fetch(`${API_URL}/api/store/layout`),
      ]);

      if (profitRes.ok) setFinancials(await profitRes.json());
      if (velRes.ok) setVelocityData(await velRes.json());
      if (commRes.ok) {
        const commData = await commRes.json();
        setCommodities(commData);
        if (commData.length > 0 && !selectedSku) {
          setSelectedSku(commData[0].sku_id);
          setNewWholesaleRate(commData[0].base_wholesale_rate);
        }
      }
      if (layoutRes.ok) setStoreLayout(await layoutRes.json());
    } catch (e) {
      console.error("Failed to load dashboard metrics", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrice = async () => {
    setPricingStatus("Pushing update...");
    try {
      const res = await fetch(`${API_URL}/api/pricing/update-commodity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: selectedSku,
          new_wholesale_rate: parseFloat(newWholesaleRate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update price");

      setPricingStatus(
        `✓ Broadcasted to 15-20 POS! New Retail Price: ₹${data.new_retail_price.toFixed(2)}`
      );
      loadDashboardData();
    } catch (err: any) {
      setPricingStatus(`Error: ${err.message}`);
    }
  };

  const selectedComm = commodities.find((c) => c.sku_id === selectedSku);
  const targetMargin = selectedComm ? parseFloat(selectedComm.target_margin_pct) : 15.0;
  const calculatedRetail = parseFloat(newWholesaleRate || "0") * (1 + targetMargin / 100);

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white">
            Owner-Controlled Financial Ecosystem & Analytics
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Real-time Gross & Net Profit Engine &bull; Physical Store Mapping &bull; Inventory Velocity
          </p>
        </div>
        <button
          onClick={loadDashboardData}
          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white px-4 py-2 rounded text-xs font-mono uppercase tracking-wider transition-colors"
        >
          {loading ? "Refreshing..." : "↻ Refresh Metrics"}
        </button>
      </div>

      {/* FINANCIAL LEDGER / NET PROFIT BREAKDOWN */}
      {financials && (
        <div className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            True Net Profit Ledger (Deducting Dynamic COGS, Rent, Power, Spillage, Salaries)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Total Revenue
              </span>
              <span className="text-2xl font-black font-mono-num text-white tracking-tight mt-1 block">
                ₹{financials.revenue.toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
                {financials.transaction_count} Invoices Completed
              </span>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Gross Profit (After COGS)
              </span>
              <span className="text-2xl font-black font-mono-num text-white tracking-tight mt-1 block">
                ₹{financials.gross_profit.toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
                Margin: {financials.gross_margin_pct}%
              </span>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Total Overheads
              </span>
              <span className="text-2xl font-black font-mono-num text-white tracking-tight mt-1 block">
                ₹{financials.overheads.total_overhead.toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
                Spillage Loss: ₹{financials.overheads.process_spillage.toLocaleString()}
              </span>
            </div>

            <div className="bg-zinc-950 border border-zinc-700 p-4 rounded-lg bg-zinc-900/40">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Store Net Profit
              </span>
              <span
                className={`text-2xl font-black font-mono-num tracking-tight mt-1 block ${
                  financials.net_profit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                ₹{financials.net_profit.toLocaleString()}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
                Net Margin: {financials.net_margin_pct}%
              </span>
            </div>
          </div>

          {/* OVERHEAD EXPENSES DETAIL CHIPS */}
          <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg flex flex-wrap gap-4 text-xs font-mono text-zinc-400">
            <div>Daily Amortized Rent: <span className="text-white font-bold">₹{financials.overheads.amortized_rent}</span></div>
            <div>Commercial Power: <span className="text-white font-bold">₹{financials.overheads.electricity}</span></div>
            <div>Staff Payroll: <span className="text-white font-bold">₹{financials.overheads.staff_salary}</span></div>
            <div>Process Spillage: <span className="text-amber-400 font-bold">₹{financials.overheads.process_spillage}</span></div>
          </div>
        </div>
      )}

      {/* DYNAMIC COMMODITY PRICING MODULE */}
      <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg space-y-4">
        <div className="border-b border-zinc-800 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Dynamic Commodity Pricing & WebSocket Push
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            Syncs 15-20 POS Computers Concurrently
          </span>
        </div>

        <p className="text-xs text-zinc-400 font-mono">
          Update the day wholesale mandi rate for Sugar, Rice, or Oil. The engine automatically recalculates the retail price across all active batches based on your predefined margin threshold and pushes it immediately via WebSockets.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end pt-2">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 block mb-1">
              Select Commodity
            </label>
            <select
              value={selectedSku}
              onChange={(e) => {
                setSelectedSku(e.target.value);
                const found = commodities.find((c) => c.sku_id === e.target.value);
                if (found) setNewWholesaleRate(found.base_wholesale_rate);
              }}
              className="w-full bg-black border border-zinc-700 text-white px-3 py-2 text-sm font-mono rounded focus:border-white focus:outline-none"
            >
              {commodities.map((c) => (
                <option key={c.sku_id} value={c.sku_id}>
                  {c.name} {c.daily_fluctuation_flag ? "⚡ (Daily Rate)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 block mb-1">
              New Wholesale Rate (₹/kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={newWholesaleRate}
              onChange={(e) => setNewWholesaleRate(e.target.value)}
              className="w-full bg-black border border-zinc-700 text-white px-3 py-2 text-sm font-mono rounded focus:border-white focus:outline-none"
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded text-xs font-mono">
            <span className="text-zinc-400 block text-[11px]">CALCULATED RETAIL ({targetMargin}% Margin):</span>
            <span className="text-white font-bold text-base font-mono-num">
              ₹{calculatedRetail.toFixed(2)}
            </span>
          </div>

          <div>
            <button
              onClick={handleUpdatePrice}
              className="w-full bg-white hover:bg-zinc-200 text-black font-black py-2.5 rounded text-xs uppercase tracking-wider transition-colors"
            >
              Broadcast To All POS
            </button>
          </div>
        </div>

        {pricingStatus && (
          <div className="text-xs font-mono text-emerald-400 bg-zinc-900 border border-zinc-800 p-2.5 rounded">
            {pricingStatus}
          </div>
        )}
      </div>

      {/* 3 DISTINCT INVENTORY VELOCITY TABLES */}
      {velocityData && (
        <div className="space-y-6">
          <div className="border-b border-zinc-800 pb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Inventory Movement & Dead Stock Analysis (Nightly Engine)
            </h2>
            <div className="text-xs font-mono flex gap-4 text-zinc-400">
              <span>Fast: <strong className="text-white">{velocityData.summary.high_velocity_count}</strong></span>
              <span>Steady: <strong className="text-white">{velocityData.summary.steady_count}</strong></span>
              <span>Dead Stock (20+ Days): <strong className="text-amber-400">{velocityData.summary.dead_stock_count}</strong></span>
            </div>
          </div>

          {/* TABLE 1: HIGH VELOCITY */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-black px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                1. High-Velocity (Fast Selling)
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Top Sales Velocity</span>
            </div>
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/40 uppercase">
                  <th className="py-2 px-3">SKU & Item</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">EAN-13</th>
                  <th className="py-2 px-3 text-right">Selling Price</th>
                  <th className="py-2 px-3 text-center">In Store</th>
                  <th className="py-2 px-3 text-center">Units Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {velocityData.high_velocity.map((item) => (
                  <tr key={item.batch_id} className="hover:bg-zinc-900/30">
                    <td className="py-2.5 px-3 font-bold text-white">{item.name}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{item.category}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{item.barcode}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">₹{item.current_selling_price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-center">{item.days_in_store} days</td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{item.units_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TABLE 2: STEADY SELLERS */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-black px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                2. Steady Sellers (Regular Inventory)
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Normal Shelf Circulation</span>
            </div>
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/40 uppercase">
                  <th className="py-2 px-3">SKU & Item</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3">EAN-13</th>
                  <th className="py-2 px-3 text-right">Selling Price</th>
                  <th className="py-2 px-3 text-center">Days In Store</th>
                  <th className="py-2 px-3 text-center">Stock Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {velocityData.steady_sellers.map((item) => (
                  <tr key={item.batch_id} className="hover:bg-zinc-900/30">
                    <td className="py-2.5 px-3 font-bold text-white">{item.name}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{item.category}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{item.barcode}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">₹{item.current_selling_price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-center">{item.days_in_store} days</td>
                    <td className="py-2.5 px-3 text-center">{item.stock_quantity} pcs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TABLE 3: DEAD STOCK (20+ DAYS) */}
          <div className="bg-zinc-950 border border-amber-900/50 rounded-lg overflow-hidden">
            <div className="bg-amber-950/20 px-4 py-2.5 border-b border-amber-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                  3. Dead Stock Alert (20+ Days Unsold)
                </span>
              </div>
              <span className="text-[11px] font-mono text-amber-400">
                Tied Capital: ₹{velocityData.summary.total_dead_stock_tied_capital?.toLocaleString()}
              </span>
            </div>
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/40 uppercase">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Barcode</th>
                  <th className="py-2 px-3 text-center">Unsold Duration</th>
                  <th className="py-2 px-3 text-right">Cost Price</th>
                  <th className="py-2 px-3 text-right">Current Price</th>
                  <th className="py-2 px-3 text-right text-amber-400">Clearance Rec.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300">
                {velocityData.dead_stock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-zinc-400">
                      No dead stock detected. All inventory moving within 20 days.
                    </td>
                  </tr>
                ) : (
                  velocityData.dead_stock.map((item) => (
                    <tr key={item.batch_id} className="hover:bg-zinc-900/30">
                      <td className="py-2.5 px-3 font-bold text-white">{item.name}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{item.barcode}</td>
                      <td className="py-2.5 px-3 text-center text-amber-300 font-bold">
                        {item.days_in_store} Days Unsold
                      </td>
                      <td className="py-2.5 px-3 text-right">₹{item.cost_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right">₹{item.current_selling_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-amber-400 font-bold">
                        ₹{item.clearance_price?.toFixed(2)} (-{item.recommended_discount_pct}%)
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PHYSICAL STORE LAYOUT MAPPING */}
      <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg space-y-4">
        <div className="border-b border-zinc-800 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Physical Store Layout Mapping (Ground Floor & 2nd Floor Factory)
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            Ground Floor Retail &bull; 2nd Floor Storage
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {storeLayout.map((coord) => {
            const fillPct = Math.min(100, Math.round((coord.current_shelf_stock / coord.max_shelf_capacity) * 100));
            const isLow = fillPct < 40;
            return (
              <div
                key={coord.id}
                className={`p-3.5 rounded border font-mono text-xs space-y-2 transition-colors ${
                  coord.floor_level === 2
                    ? "bg-zinc-900/40 border-zinc-700"
                    : isLow
                    ? "bg-amber-950/20 border-amber-800/60"
                    : "bg-zinc-950 border-zinc-800"
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-white">
                    {coord.floor_level === 2 ? "2ND FLOOR" : coord.aisle_id}
                  </span>
                  <span className="text-zinc-400">{coord.shelf_section}</span>
                </div>
                <div className="text-zinc-300 font-semibold text-xs truncate">
                  {coord.product_name}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Stock: {coord.current_shelf_stock} pcs</span>
                    <span>Max: {coord.max_shelf_capacity}</span>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${isLow ? "bg-amber-500" : "bg-white"}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
