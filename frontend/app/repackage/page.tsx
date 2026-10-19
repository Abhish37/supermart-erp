"use client";

import React, { useState, useEffect } from "react";

interface RepackageResult {
  repackage_job_id: string;
  sku_id: string;
  product_name: string;
  bulk_weight_kg: number;
  actual_yield_kg: number;
  spillage_kg: number;
  spillage_financial_loss: number;
  unit_cost_price: number;
  unit_selling_price: number;
  output_batch_id: string;
  primary_barcode: string;
  sample_barcodes: string[];
  overhead_entry_id: string;
  status: string;
}

export default function RepackagePage() {
  const [skuId, setSkuId] = useState("SKU-SUGAR-01");
  const [bulkBatchId, setBulkBatchId] = useState("BULK-SACK-50KG-FACTORY");
  const [bulkWeightKg, setBulkWeightKg] = useState("50.0");
  const [bulkTotalCost, setBulkTotalCost] = useState("2000.00");
  const [yieldPackets, setYieldPackets] = useState("48");
  const [unitWeightKg, setUnitWeightKg] = useState("1.0");
  const [sellingPrice, setSellingPrice] = useState("46.00");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepackageResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/repackaging/history`);
      if (res.ok) setHistory(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/repackaging/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: skuId,
          bulk_batch_id: bulkBatchId,
          bulk_weight_kg: parseFloat(bulkWeightKg),
          bulk_total_cost: parseFloat(bulkTotalCost),
          yield_packets: parseInt(yieldPackets, 10),
          unit_packet_weight_kg: parseFloat(unitWeightKg),
          selling_price_per_unit: parseFloat(sellingPrice),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Repackaging conversion failed");

      setResult(data);
      fetchHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const previewYieldKg = (parseInt(yieldPackets || "0", 10) * parseFloat(unitWeightKg || "0"));
  const previewSpillageKg = Math.max(0, parseFloat(bulkWeightKg || "0") - previewYieldKg);
  const costPerKg = parseFloat(bulkTotalCost || "0") / Math.max(1, parseFloat(bulkWeightKg || "1"));
  const previewSpillageCost = previewSpillageKg * costPerKg;

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="border-b border-zinc-200 pb-4">
        <h1 className="text-xl font-black uppercase tracking-wider text-zinc-900">
          2nd-Floor Private Label Factory — Bulk-to-Unit Conversion
        </h1>
        <p className="text-xs font-mono text-zinc-500 mt-1">
          Automated Process Spillage Calculation &bull; Financial Overhead Ledger Logging &bull; Unique EAN-13 Barcode Generation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* REPACKAGING CONVERSION FORM */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 shadow-xs p-6 rounded-xl space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 border-b border-zinc-200 pb-2">
            Initiate Repackaging Job
          </h2>

          <form onSubmit={handleConvert} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Target Product SKU
                </label>
                <select
                  value={skuId}
                  onChange={(e) => setSkuId(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                >
                  <option value="SKU-SUGAR-01">SuperMart Premium White Sugar 1kg</option>
                  <option value="SKU-RICE-01">SuperMart Royal Basmati Rice 1kg</option>
                  <option value="SKU-ATTA-01">SuperMart Sharbati Whole Wheat Atta 5kg</option>
                  <option value="SKU-DAL-01">SuperMart Unpolished Toor Dal 1kg</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Bulk Sack Batch ID
                </label>
                <input
                  type="text"
                  value={bulkBatchId}
                  onChange={(e) => setBulkBatchId(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Input Bulk Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={bulkWeightKg}
                  onChange={(e) => setBulkWeightKg(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Total Bulk Cost (₹)
                </label>
                <input
                  type="number"
                  step="1"
                  value={bulkTotalCost}
                  onChange={(e) => setBulkTotalCost(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Packets Output Yield (Units)
                </label>
                <input
                  type="number"
                  value={yieldPackets}
                  onChange={(e) => setYieldPackets(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-1 font-medium">
                  Target Packet Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={unitWeightKg}
                  onChange={(e) => setUnitWeightKg(e.target.value)}
                  className="w-full bg-white border border-zinc-300 text-zinc-900 px-3 py-2 text-sm font-mono rounded-lg focus:border-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            {/* REAL-TIME MATHEMATICAL SPILLAGE PREVIEW */}
            <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl font-mono text-xs space-y-2">
              <span className="text-zinc-500 uppercase tracking-wider block font-bold">
                Automated Spillage Math Preview
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-700">
                <div>Input: <strong className="text-zinc-900">{bulkWeightKg} kg</strong></div>
                <div>Yield: <strong className="text-zinc-900">{previewYieldKg} kg</strong></div>
                <div>Spillage: <strong className="text-amber-700">{previewSpillageKg.toFixed(2)} kg</strong></div>
                <div>Financial Loss: <strong className="text-amber-700">₹{previewSpillageCost.toFixed(2)}</strong></div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-mono rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-zinc-800 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-colors disabled:opacity-50 shadow-xs"
            >
              {loading ? "PROCESSING SPILLAGE & GENERATING BARCODES..." : "EXECUTE BULK-TO-UNIT CONVERSION"}
            </button>
          </form>
        </div>

        {/* SPILLAGE LOSS AUDIT LEDGER */}
        <div className="bg-white border border-zinc-200 shadow-xs p-6 rounded-xl space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 border-b border-zinc-200 pb-2">
            Spillage Expense Ledger
          </h2>
          <p className="text-xs text-zinc-500 font-mono">
            Every gram of milling loss is automatically deducted from yield and recorded as a financial loss in the store overhead ledger.
          </p>

          <div className="space-y-3 overflow-y-auto max-h-[360px]">
            {history.length === 0 ? (
              <div className="text-xs font-mono text-zinc-400 text-center py-8">
                No recent spillage entries
              </div>
            ) : (
              history.map((h, i) => (
                <div key={i} className="bg-zinc-50 border border-zinc-200 p-3 rounded-lg font-mono text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-900 font-bold">{h.overhead_id}</span>
                    <span className="text-amber-700 font-bold">₹{parseFloat(h.spillage_loss).toFixed(2)} Loss</span>
                  </div>
                  <div className="text-zinc-500 text-[11px]">{h.notes}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* JOB SUCCESS & PRINTABLE EAN-13 BARCODE CARDS */}
      {result && (
        <div className="bg-white border border-zinc-300 shadow-sm p-6 rounded-xl space-y-4">
          <div className="border-b border-zinc-200 pb-3 flex items-center justify-between">
            <div>
              <span className="text-emerald-700 font-mono text-xs font-bold block">✓ CONVERSION COMPLETE</span>
              <h3 className="text-base font-bold text-zinc-900 uppercase tracking-wider">
                {result.product_name} &bull; Batch {result.output_batch_id}
              </h3>
            </div>
            <div className="text-right text-xs font-mono text-zinc-500">
              <div>Actual Yield: <strong className="text-zinc-900">{result.actual_yield_kg}kg</strong></div>
              <div>Spillage Loss: <strong className="text-amber-700">₹{result.spillage_financial_loss.toFixed(2)}</strong></div>
            </div>
          </div>

          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 block mb-2 font-medium">
              Generated Modulo-10 EAN-13 Barcodes ({result.sample_barcodes.length} previewed of yield):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {result.sample_barcodes.map((code, idx) => (
                <div
                  key={code}
                  className="bg-white border border-zinc-300 p-3 rounded-lg text-center font-mono space-y-1 shadow-2xs hover:border-zinc-500 transition-colors"
                >
                  <span className="text-[10px] text-zinc-500 block font-medium">PACKET #{idx + 1}</span>
                  <div className="text-sm font-bold text-zinc-900 tracking-widest">{code}</div>
                  <span className="text-[11px] text-zinc-600 block">₹{result.unit_selling_price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
