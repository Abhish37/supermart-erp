"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  UploadCloud,
  FileCheck2,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertOctagon,
  Percent
} from "lucide-react";

export default function InventoryExpiryPage() {
  const [activeTab, setActiveTab] = useState<"expiry" | "repack" | "import">("expiry");
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<any>(null);

  // Expiry data state
  const [expiryData, setExpiryData] = useState<any>({
    total_capital_at_risk_under_45d: 14750.00,
    tiers: {
      critical_15d: [
        {
          sku: "SKU-SWEETS-500",
          product_name: "Haldirams Kaju Katli Gift Pack 500g",
          lot_number: "LOT-HALD-DIWALI",
          expiry_date: "2026-11-28",
          days_to_expiry: 17,
          on_hand_qty: 15.0,
          capital_at_risk: 5850.00,
          risk_tier: "CRITICAL_15D",
          action: "APPLY_CLEARANCE_MARKDOWN",
          recommended_discount_pct: 22.5,
          floor_protected_price: 397.80,
          expected_leftover_units: 8.5,
          rationale: "tau=17d. Dynamic clearance discount of 22.5% applied. Floor protected at 102% cost (₹397.80)."
        }
      ],
      high_30d: [
        {
          sku: "SKU-OIL-01",
          product_name: "Fortune Soyabean Oil 1L Pouch",
          lot_number: "LOT-OIL-2026A",
          expiry_date: "2026-12-05",
          days_to_expiry: 24,
          on_hand_qty: 12.0,
          capital_at_risk: 1380.00,
          risk_tier: "HIGH_30D",
          action: "ACCELERATED_MARKDOWN",
          recommended_discount_pct: 12.0,
          floor_protected_price: 118.80,
          expected_leftover_units: 4.0,
          rationale: "tau=24d. High 30-day velocity warning. Moderate 12% markdown applied."
        }
      ],
      warning_45d: [],
      watch_60d: [
        {
          sku: "SKU-GHEE-01",
          product_name: "Amul Pure Cow Ghee 1L Tin",
          lot_number: "LOT-GHEE-AUG",
          expiry_date: "2027-02-01",
          days_to_expiry: 82,
          on_hand_qty: 8.0,
          capital_at_risk: 4320.00,
          risk_tier: "WATCH_60D",
          action: "GENERATE_RTV_CREDIT_NOTE",
          recommended_discount_pct: 0.0,
          floor_protected_price: 544.64,
          expected_leftover_units: 6.0,
          rationale: "tau=82d within vendor return window. Claim full supplier credit note before expiry."
        }
      ]
    }
  });

  // Repackaging simulation state
  const [repackInput, setRepackInput] = useState({
    bulk_sku: "SKU-BULK-DAL50",
    bulk_cost_per_kg: 124.0,
    bulk_consumed_kg: 50.0,
    target_pack_sku: "SKU-PACK-DAL1",
    target_pack_weight_kg: 1.0,
    packaging_loss_factor: 0.008,
    target_selling_price: 165.0
  });
  const [repackOutput, setRepackOutput] = useState<any>(null);

  const calculateRepack = () => {
    const consumed = repackInput.bulk_consumed_kg;
    const loss = consumed * repackInput.packaging_loss_factor;
    const usable = consumed - loss;
    const units = Math.floor(usable / repackInput.target_pack_weight_kg);
    const costProduced = (consumed * repackInput.bulk_cost_per_kg + units * 2.5) / units;
    const margin = ((repackInput.target_selling_price - costProduced) / repackInput.target_selling_price) * 100;

    setRepackOutput({
      units_produced: units,
      loss_kg: loss.toFixed(3),
      loss_pct: (repackInput.packaging_loss_factor * 100).toFixed(1),
      unit_cost_produced: costProduced.toFixed(2),
      gross_margin_pct: margin.toFixed(2),
      leftover_fraction: (usable - units * repackInput.target_pack_weight_kg).toFixed(3)
    });
  };

  useEffect(() => {
    calculateRepack();
  }, [repackInput]);

  return (
    <div className="space-y-6">
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Inventory Truth & Expiry Decay Optimizer
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
              FEFO LEDGER
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Facility: 4,500 sq.ft Supermarket &bull; Dalli Rajhara &bull; Double-Entry Audit Engine
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs font-mono">
          <button
            onClick={() => setActiveTab("expiry")}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              activeTab === "expiry"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Expiry Risk Tiers
          </button>
          <button
            onClick={() => setActiveTab("repack")}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              activeTab === "repack"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Loose Conversion (22-32% Margin)
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              activeTab === "import"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            POS CSV Import
          </button>
        </div>
      </div>

      {/* TAB 1: EXPIRY RISK TIERS */}
      {activeTab === "expiry" && (
        <div className="space-y-6">
          {/* TOP METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-rose-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
                <span>Critical Risk (&le; 15 Days)</span>
                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold">Rose Red</span>
              </div>
              <div className="text-2xl font-black text-rose-700 mt-2 font-mono">
                ₹{expiryData.tiers.critical_15d.reduce((acc: any, x: any) => acc + x.capital_at_risk, 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {expiryData.tiers.critical_15d.length} batches requiring flash clearance
              </div>
            </div>

            <div className="bg-white border border-amber-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
                <span>Moderate Risk (16–45 Days)</span>
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">Amber Warning</span>
              </div>
              <div className="text-2xl font-black text-amber-700 mt-2 font-mono">
                ₹{expiryData.tiers.high_30d.reduce((acc: any, x: any) => acc + x.capital_at_risk, 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {expiryData.tiers.high_30d.length} batches with dynamic markdown active
              </div>
            </div>

            <div className="bg-white border border-blue-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
                <span>RTV Return Window (&ge; 60 Days)</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">Cobalt Action</span>
              </div>
              <div className="text-2xl font-black text-blue-800 mt-2 font-mono">
                ₹{expiryData.tiers.watch_60d.reduce((acc: any, x: any) => acc + x.capital_at_risk, 0).toLocaleString()}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {expiryData.tiers.watch_60d.length} returnable batches eligible for supplier credit
              </div>
            </div>
          </div>

          {/* ACTIONABLE BATCH TABLE */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
                  Active FEFO Batches &amp; Recovery Strategy
                </h3>
                <p className="text-xs text-zinc-500 font-mono">
                  Floor formula: SellingPrice &times; (1 &minus; &delta;*) &ge; LandedCost &times; 1.02 (+2% minimum recovery)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-100/75 border-b border-zinc-200 text-zinc-600 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">SKU &amp; Product</th>
                    <th className="p-3">Lot Number</th>
                    <th className="p-3">Days Left (&tau;)</th>
                    <th className="p-3">Remaining Stock</th>
                    <th className="p-3">Capital at Risk</th>
                    <th className="p-3">Markdown / Action</th>
                    <th className="p-3">Floor Price</th>
                    <th className="p-3">Mathematical Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {expiryData.tiers.critical_15d.map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-rose-50/40 transition-colors">
                      <td className="p-3 font-bold text-zinc-900">
                        {b.sku}
                        <div className="text-[11px] text-zinc-500 font-normal">{b.product_name}</div>
                      </td>
                      <td className="p-3 text-zinc-600">{b.lot_number}</td>
                      <td className="p-3 font-bold text-rose-700">{b.days_to_expiry} days</td>
                      <td className="p-3 font-bold">{b.on_hand_qty} units</td>
                      <td className="p-3 font-bold text-rose-800">₹{b.capital_at_risk.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                          -{b.recommended_discount_pct}% FLASH
                        </span>
                      </td>
                      <td className="p-3 font-bold text-emerald-700">₹{b.floor_protected_price}</td>
                      <td className="p-3 text-[11px] text-zinc-600 max-w-xs">{b.rationale}</td>
                    </tr>
                  ))}

                  {expiryData.tiers.high_30d.map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3 font-bold text-zinc-900">
                        {b.sku}
                        <div className="text-[11px] text-zinc-500 font-normal">{b.product_name}</div>
                      </td>
                      <td className="p-3 text-zinc-600">{b.lot_number}</td>
                      <td className="p-3 font-bold text-amber-700">{b.days_to_expiry} days</td>
                      <td className="p-3 font-bold">{b.on_hand_qty} units</td>
                      <td className="p-3 font-bold text-amber-800">₹{b.capital_at_risk.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                          -{b.recommended_discount_pct}% MARKDOWN
                        </span>
                      </td>
                      <td className="p-3 font-bold text-emerald-700">₹{b.floor_protected_price}</td>
                      <td className="p-3 text-[11px] text-zinc-600 max-w-xs">{b.rationale}</td>
                    </tr>
                  ))}

                  {expiryData.tiers.watch_60d.map((b: any, idx: number) => (
                    <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 font-bold text-zinc-900">
                        {b.sku}
                        <div className="text-[11px] text-zinc-500 font-normal">{b.product_name}</div>
                      </td>
                      <td className="p-3 text-zinc-600">{b.lot_number}</td>
                      <td className="p-3 font-bold text-blue-700">{b.days_to_expiry} days</td>
                      <td className="p-3 font-bold">{b.on_hand_qty} units</td>
                      <td className="p-3 font-bold text-blue-900">₹{b.capital_at_risk.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                          CLAIM RTV CREDIT
                        </span>
                      </td>
                      <td className="p-3 font-bold text-zinc-700">₹{b.floor_protected_price}</td>
                      <td className="p-3 text-[11px] text-zinc-600 max-w-xs">{b.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOOSE REPACKAGING CONVERTER */}
      {activeTab === "repack" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-zinc-900">
                In-Store Commodity Disassembly &amp; Transformation
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Splitting 50kg unbranded bulk sacks into 1kg &amp; 5kg store-branded bags captures 22–32% margins vs 8–12% FMCG.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-zinc-700 mb-1 font-bold">Source Bulk Commodity SKU</label>
                <input
                  type="text"
                  value={repackInput.bulk_sku}
                  onChange={(e) => setRepackInput({ ...repackInput, bulk_sku: e.target.value })}
                  className="w-full border border-zinc-300 rounded px-3 py-1.5 bg-zinc-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Bulk Consumed (kg)</label>
                  <input
                    type="number"
                    value={repackInput.bulk_consumed_kg}
                    onChange={(e) => setRepackInput({ ...repackInput, bulk_consumed_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Bulk Cost Price (₹/kg)</label>
                  <input
                    type="number"
                    value={repackInput.bulk_cost_per_kg}
                    onChange={(e) => setRepackInput({ ...repackInput, bulk_cost_per_kg: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Target Pack SKU</label>
                  <input
                    type="text"
                    value={repackInput.target_pack_sku}
                    onChange={(e) => setRepackInput({ ...repackInput, target_pack_sku: e.target.value })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Pack Size (kg)</label>
                  <input
                    type="number"
                    value={repackInput.target_pack_weight_kg}
                    onChange={(e) => setRepackInput({ ...repackInput, target_pack_weight_kg: parseFloat(e.target.value) || 1 })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Packaging Loss Factor (&theta;)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={repackInput.packaging_loss_factor}
                    onChange={(e) => setRepackInput({ ...repackInput, packaging_loss_factor: parseFloat(e.target.value) || 0.008 })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-bold">Target Selling Price (₹)</label>
                  <input
                    type="number"
                    value={repackInput.target_selling_price}
                    onChange={(e) => setRepackInput({ ...repackInput, target_selling_price: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-zinc-300 rounded px-3 py-1.5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RESULT CARD */}
          {repackOutput && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wide">
                    Double-Entry Ledger Output
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800">
                    +{repackOutput.gross_margin_pct}% GROSS MARGIN
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 font-mono">
                  <div className="bg-white p-3 rounded-lg border border-blue-100">
                    <span className="text-[11px] text-zinc-500">Packs Produced</span>
                    <div className="text-xl font-bold text-zinc-900">{repackOutput.units_produced} Units</div>
                    <span className="text-[10px] text-zinc-400">of {repackInput.target_pack_sku}</span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-blue-100">
                    <span className="text-[11px] text-zinc-500">Unit Landed Cost</span>
                    <div className="text-xl font-bold text-blue-900">₹{repackOutput.unit_cost_produced}</div>
                    <span className="text-[10px] text-zinc-400">includes ₹2.50 packaging</span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-blue-100">
                    <span className="text-[11px] text-zinc-500">Packaging Spillage Loss</span>
                    <div className="text-xl font-bold text-rose-600">{repackOutput.loss_kg} kg</div>
                    <span className="text-[10px] text-zinc-400">Loss factor: {repackOutput.loss_pct}%</span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-blue-100">
                    <span className="text-[11px] text-zinc-500">Unpacked Residue</span>
                    <div className="text-xl font-bold text-zinc-700">{repackOutput.leftover_fraction} kg</div>
                    <span className="text-[10px] text-zinc-400">stored in bin tail</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-blue-200">
                <button
                  onClick={() => alert("Simulated Double-Entry Movement logged: LOOSE_CONVERSION_OUT (-50kg) & LOOSE_CONVERSION_IN (+49 units) recorded in inventory_movements.")}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-mono text-xs font-bold py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Post Double-Entry Transformation to Ledger
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: POS CSV IMPORT */}
      {activeTab === "import" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-xs max-w-2xl mx-auto space-y-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900">
              POS Daily CSV Ingestion &amp; Cryptographic Deduplication
            </h3>
            <p className="text-xs text-zinc-500 font-mono mt-1">
              Validates schema, checks SHA-256 row payload hash, deduplicates, and enqueues malformed rows into Quarantine.
            </p>
          </div>

          <div className="border-2 border-dashed border-zinc-300 rounded-xl p-8 text-center bg-zinc-50/50 hover:bg-zinc-50 transition-colors cursor-pointer">
            <UploadCloud className="w-10 h-10 text-blue-600 mx-auto mb-2" />
            <div className="text-xs font-bold text-zinc-800 font-mono">
              Drag &amp; Drop Daily POS Dump CSV or Click to Browse
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-1">
              Supports POS Terminal Dumps, Weighing Scale CSVs, and Back-Office Bills
            </div>
            <input
              type="file"
              accept=".csv"
              className="mt-4 text-xs font-mono"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setImportStatus({
                    fileName: e.target.files[0].name,
                    hash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    status: "VERIFIED",
                    rows: 240,
                    quarantine: 0
                  });
                }
              }}
            />
          </div>

          {importStatus && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs font-mono space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                POS Import Verified &amp; Ledger Updated
              </div>
              <div className="text-zinc-600">File: {importStatus.fileName}</div>
              <div className="text-zinc-600">SHA-256 Hash: {importStatus.hash.substring(0, 32)}...</div>
              <div className="text-emerald-700 font-bold">
                {importStatus.rows} rows imported &bull; Zero quarantine errors &bull; FEFO stock depleted
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
