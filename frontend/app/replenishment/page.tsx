"use client";

import React, { useState } from "react";

interface FloorAlert {
  type: string;
  sku_id: string;
  product_name: string;
  target_aisle: string;
  target_shelf: string;
  current_shelf_stock: number;
  pull_from_floor: string;
  pull_batch_id: string;
  pull_quantity: number;
  fifo_arrival_date: string;
  timestamp: string;
}

interface PurchaseOrder {
  po_number: string;
  sku_id: string;
  product_name: string;
  total_current_stock: number;
  dynamic_threshold: number;
  reorder_quantity: number;
  total_cost: number;
  pdf_filename: string;
  pdf_url: string;
  whatsapp_status: string;
}

export default function ReplenishmentPage() {
  const [loading, setLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<{
    is_payday_tsunami_window: boolean;
    shelf_routing_alerts: FloorAlert[];
    purchase_orders_created: PurchaseOrder[];
  } | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleEvaluate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/replenishment/evaluate`, {
        method: "POST",
      });
      if (res.ok) {
        setEvalResult(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-zinc-900">
            Smart Replenishment & Automated Purchase Orders
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            Payday Tsunami 1.5x Dynamic Buffer &bull; Oldest FIFO Batch Storage Routing &bull; WhatsApp PDF PO Delivery
          </p>
        </div>
        <button
          onClick={handleEvaluate}
          disabled={loading}
          className="bg-black hover:bg-zinc-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-50 shadow-xs"
        >
          {loading ? "EVALUATING INVENTORY..." : "⚡ EVALUATE STOCK & AUTO-REORDER"}
        </button>
      </div>

      {/* PAYDAY TSUNAMI BUFFER STATUS CARD */}
      <div className="bg-white border border-zinc-200 shadow-xs p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs">
        <div>
          <span className="text-zinc-900 font-bold block mb-1 uppercase tracking-wider">
            Payday Tsunami Buffer Window (1st &ndash; 10th of Month)
          </span>
          <p className="text-zinc-600">
            During peak salary payout periods, the system automatically escalates buffer stock thresholds by 1.5x to prevent stockouts during heavy footfall.
          </p>
        </div>
        <div className="px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-center whitespace-nowrap">
          <span className="text-zinc-500 block text-[11px]">ACTIVE BUFFER MULTIPLIER:</span>
          <span className="text-zinc-900 font-bold text-sm">
            {evalResult?.is_payday_tsunami_window ? "1.50x (PEAK ACTIVE)" : "1.00x (Standard Cycle)"}
          </span>
        </div>
      </div>

      {evalResult && (
        <div className="space-y-8">
          {/* FLOOR MANAGER FIFO SHELF ROUTING ALERTS */}
          <div className="bg-white border border-zinc-200 shadow-xs rounded-xl overflow-hidden">
            <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-900">
                  Floor Manager Tablet Routing (Oldest FIFO Batches from 2nd Floor)
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-500">
                {evalResult.shelf_routing_alerts.length} Shelves Need Pull
              </span>
            </div>

            <div className="divide-y divide-zinc-100">
              {evalResult.shelf_routing_alerts.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-zinc-500">
                  Ground floor shelves are fully stocked. No storage pulls needed.
                </div>
              ) : (
                evalResult.shelf_routing_alerts.map((alert, i) => (
                  <div key={i} className="p-4 font-mono text-xs space-y-2 hover:bg-zinc-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-bold text-zinc-900 text-sm">
                        {alert.product_name} ({alert.sku_id})
                      </span>
                      <span className="text-blue-800 font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                        PULL {alert.pull_quantity} PCS FROM 2ND FLOOR
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-600 text-[11px]">
                      <div>Target Shelf: <strong className="text-zinc-900">{alert.target_aisle} / {alert.target_shelf}</strong></div>
                      <div>Current Shelf Stock: <strong className="text-amber-700">{alert.current_shelf_stock} pcs</strong></div>
                      <div>FIFO Batch: <strong className="text-zinc-900">{alert.pull_batch_id}</strong></div>
                      <div>Arrival: <strong className="text-zinc-900">{new Date(alert.fifo_arrival_date).toLocaleDateString()}</strong></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* GENERATED PURCHASE ORDERS (PDF & WHATSAPP) */}
          <div className="bg-white border border-zinc-200 shadow-xs rounded-xl overflow-hidden">
            <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-900">
                Generated Vendor Purchase Orders (ReportLab PDF Engine)
              </h2>
              <span className="text-xs font-mono text-zinc-500">
                {evalResult.purchase_orders_created.length} Reorders Generated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600 bg-zinc-50/50 uppercase">
                    <th className="py-2.5 px-3">PO Number</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Store Stock</th>
                    <th className="py-2.5 px-3 text-center">Reorder Qty</th>
                    <th className="py-2.5 px-3 text-right">Total Est. Cost</th>
                    <th className="py-2.5 px-3 text-center">WhatsApp Alert</th>
                    <th className="py-2.5 px-3 text-center">PDF Purchase Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {evalResult.purchase_orders_created.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-zinc-500">
                        Total store inventory exceeds minimum threshold. No vendor purchase orders required.
                      </td>
                    </tr>
                  ) : (
                    evalResult.purchase_orders_created.map((po) => (
                      <tr key={po.po_number} className="hover:bg-zinc-50 transition-colors">
                        <td className="py-3 px-3 font-bold text-zinc-900">{po.po_number}</td>
                        <td className="py-3 px-3 font-semibold text-zinc-900">{po.product_name}</td>
                        <td className="py-3 px-3 text-center text-amber-700 font-bold">{po.total_current_stock} pcs</td>
                        <td className="py-3 px-3 text-center font-bold text-zinc-900">{po.reorder_quantity} pcs</td>
                        <td className="py-3 px-3 text-right font-bold text-zinc-900">₹{po.total_cost.toLocaleString()}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {po.whatsapp_status || "DISPATCHED"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <a
                            href={po.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black hover:bg-zinc-800 text-white px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors inline-block shadow-2xs"
                          >
                            Download PDF
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
