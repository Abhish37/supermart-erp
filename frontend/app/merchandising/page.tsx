"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  ShoppingBag,
  ExternalLink,
  Sliders,
  CheckCircle2,
  Info
} from "lucide-react";

export default function MerchandisingPage() {
  const [activeTab, setActiveTab] = useState<"basket" | "space">("basket");

  // Market basket rules (from FP-Growth engine)
  const basketRules = [
    {
      antecedent: "HMT Kolam Rice 25kg (SKU-RICE-25)",
      consequent: "Amul Cow Ghee 1L (SKU-GHEE-01)",
      support: 0.09,
      confidence: 0.30,
      lift: 2.00,
      aisle_antecedent: "Staples (Grains)",
      aisle_consequent: "Fresh (Dairy)",
      is_cross_aisle: true,
      layout_action: "SECONDARY_DISPLAY_END_CAP",
      recommendation_text: "High 2.0x association between Rice & Ghee in separate aisles. Co-locate 1L Ghee bottles on Aisle 1 End-Cap."
    },
    {
      antecedent: "Fortune Soyabean Oil 1L (SKU-OIL-01)",
      consequent: "Madhur Crystal Sugar 5kg (SKU-SUGAR-5)",
      support: 0.12,
      confidence: 0.42,
      lift: 1.75,
      aisle_antecedent: "Staples (Oils)",
      aisle_consequent: "Staples (Sugar)",
      is_cross_aisle: false,
      layout_action: "SHELF_ADJACENT_STRIP",
      recommendation_text: "Strong 1.75x affinity within staples aisle. Place side-by-side or cross-strip on Eye-Level Shelf."
    },
    {
      antecedent: "Sharbati Atta 20kg (SKU-ATTA-20)",
      consequent: "Fortune Oil 15L Tin (SKU-OIL-15L)",
      support: 0.08,
      confidence: 0.38,
      lift: 1.85,
      aisle_antecedent: "Staples (Flours)",
      aisle_consequent: "Staples (Bulk Tins)",
      is_cross_aisle: true,
      layout_action: "SECONDARY_DISPLAY_END_CAP",
      recommendation_text: "SAIL Mining payday bulk bundle (Lift: 1.85x). Feature Atta & 15L Tin co-placement at cash counter corridor."
    },
    {
      antecedent: "Desi Gur / Jaggery 1kg (SKU-JAGGERY-1K)",
      consequent: "Haldirams Sweets Pack (SKU-SWEETS-500)",
      support: 0.06,
      confidence: 0.45,
      lift: 1.92,
      aisle_antecedent: "Food (Traditional)",
      aisle_consequent: "Food (Confectionery)",
      is_cross_aisle: true,
      layout_action: "SECONDARY_DISPLAY_END_CAP",
      recommendation_text: "Pola & Festive sweet surge (Lift: 1.92x). Secondary display end-cap at entrance aisle."
    }
  ];

  // Space productivity rankings (GPPLF)
  const gpplfRankings = [
    {
      category: "Dairy & Ghee (Fresh)",
      linear_feet: 6.0,
      gross_profit: 32400.0,
      gpplf: 5400.0,
      ratio: 1.65,
      action: "EXPAND_SHELF_ALLOCATION",
      directive: "High-yield category (₹5,400/ft). Expand linear facings by +2.0 ft to capture incremental margin."
    },
    {
      category: "Edible Oils & Fats (Staples)",
      linear_feet: 12.0,
      gross_profit: 52800.0,
      gpplf: 4400.0,
      ratio: 1.35,
      action: "MAINTAIN_CURRENT_SPACE",
      directive: "Optimal shelf balance (₹4,400/ft). Maintain current 12 ft aisle frontage."
    },
    {
      category: "Grains & Flours (Staples)",
      linear_feet: 18.0,
      gross_profit: 64800.0,
      gpplf: 3600.0,
      ratio: 1.10,
      action: "MAINTAIN_CURRENT_SPACE",
      directive: "Core township volume driver. High inventory turn with solid cash flow."
    },
    {
      category: "Packaged Sweets & Snacks (Food)",
      linear_feet: 10.0,
      gross_profit: 28500.0,
      gpplf: 2850.0,
      ratio: 0.87,
      action: "MAINTAIN_CURRENT_SPACE",
      directive: "Stable space yield. Re-align facings towards high-lift festive SKUs."
    },
    {
      category: "Agri Tools & Hardware (Non-Food)",
      linear_feet: 8.0,
      gross_profit: 12400.0,
      gpplf: 1550.0,
      ratio: 0.47,
      action: "FACING_REDUCTION_OR_ASSORTMENT_PRUNING",
      directive: "Yield is below 60% store average (₹1,550/ft vs ₹3,260/ft). Prune slow-moving sickles and reduce facing to 4.0 ft."
    }
  ];

  const storeAvgGPPLF = 3260.0;

  return (
    <div className="space-y-6">
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Merchandising Intelligence &amp; Space Yield
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
              FP-GROWTH &bull; GPPLF
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Facility: 4,500 sq.ft Supermarket &bull; Dalli Rajhara &bull; Floor Directives &bull; Association Rules
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs font-mono">
          <button
            onClick={() => setActiveTab("basket")}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              activeTab === "basket"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Market Basket Affinity (Lift)
          </button>
          <button
            onClick={() => setActiveTab("space")}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              activeTab === "space"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Space Productivity (GPPLF)
          </button>
        </div>
      </div>

      {/* TAB 1: MARKET BASKET MINING */}
      {activeTab === "basket" && (
        <div className="space-y-6">
          {/* STATS OVERVIEW */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-zinc-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-mono text-zinc-500 uppercase">Co-Purchase Rules</span>
              <div className="text-2xl font-black text-blue-900 mt-1 font-mono">{basketRules.length} Pairs</div>
              <div className="text-[11px] text-zinc-500 mt-1 font-mono">Support &ge; 0.015 &bull; Conf &ge; 0.40</div>
            </div>

            <div className="bg-white border border-emerald-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-mono text-zinc-500 uppercase">Highest Lift Factor</span>
              <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">2.00x</div>
              <div className="text-[11px] text-emerald-600 mt-1 font-mono">Rice 25kg &bull; Amul Ghee 1L</div>
            </div>

            <div className="bg-white border border-blue-200 p-4 rounded-xl shadow-xs">
              <span className="text-xs font-mono text-zinc-500 uppercase">End-Cap Directives</span>
              <div className="text-2xl font-black text-blue-800 mt-1 font-mono">
                {basketRules.filter((r) => r.layout_action === "SECONDARY_DISPLAY_END_CAP").length} Active
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 font-mono">Lift &ge; 1.80x Cross-Aisle Placements</div>
            </div>
          </div>

          {/* RULES TABLE */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
                  Mined Association Rules &amp; Floor Layout Directives
                </h3>
                <p className="text-xs text-zinc-500 font-mono">
                  Algorithm: FP-Growth Protocol &bull; Lift = Support(X &cup; Y) / [Support(X) &times; Support(Y)]
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-100/75 border-b border-zinc-200 text-zinc-600 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">Primary Item (Antecedent)</th>
                    <th className="p-3">Associated Item (Consequent)</th>
                    <th className="p-3">Lift Factor</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Support</th>
                    <th className="p-3">Merchandising Directive</th>
                    <th className="p-3">Action Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {basketRules.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="p-3 font-bold text-zinc-900">
                        {rule.antecedent}
                        <div className="text-[10px] text-zinc-500 font-normal">{rule.aisle_antecedent}</div>
                      </td>
                      <td className="p-3 font-bold text-zinc-900">
                        {rule.consequent}
                        <div className="text-[10px] text-zinc-500 font-normal">{rule.aisle_consequent}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {rule.lift.toFixed(2)}x
                        </span>
                      </td>
                      <td className="p-3 font-bold text-zinc-700">{(rule.confidence * 100).toFixed(0)}%</td>
                      <td className="p-3 text-zinc-500">{(rule.support * 100).toFixed(1)}%</td>
                      <td className="p-3">
                        {rule.layout_action === "SECONDARY_DISPLAY_END_CAP" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                            SECONDARY END-CAP
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-800">
                            ADJACENT STRIP
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] text-zinc-600 max-w-xs">{rule.recommendation_text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SPACE PRODUCTIVITY (GPPLF) */}
      {activeTab === "space" && (
        <div className="space-y-6">
          <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-800 shrink-0 mt-0.5" />
            <div className="text-xs font-mono text-blue-900">
              <span className="font-bold">Gross Profit per Linear Foot (GPPLF) Doctrine:</span>
              <div className="mt-1 text-zinc-700">
                Formula: GPPLF_c = &sum;(NetRevenue_i &minus; COGS_i) / LinearFeetAllocated_c &bull; Store Baseline: ₹{storeAvgGPPLF.toLocaleString()}/ft.
                Categories under 60% of baseline are flagged for facing reduction or assortment pruning; categories over 140% are candidates for expansion.
              </div>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 bg-zinc-50/80 border-b border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
                Departmental Space Yield &amp; Shelf Reallocation Plan
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-100/75 border-b border-zinc-200 text-zinc-600 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">Category / Department</th>
                    <th className="p-3">Linear Feet Allocated</th>
                    <th className="p-3">Gross Profit Realized</th>
                    <th className="p-3">GPPLF (₹ / Foot)</th>
                    <th className="p-3">Index to Store Avg</th>
                    <th className="p-3">Shelf Action</th>
                    <th className="p-3">Layout Directive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {gpplfRankings.map((cat, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                      <td className="p-3 font-bold text-zinc-900">{cat.category}</td>
                      <td className="p-3 font-bold">{cat.linear_feet.toFixed(1)} ft</td>
                      <td className="p-3 font-bold text-zinc-900">₹{cat.gross_profit.toLocaleString()}</td>
                      <td className="p-3 font-bold text-blue-900">₹{cat.gpplf.toLocaleString()}/ft</td>
                      <td className="p-3 font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            cat.ratio >= 1.4
                              ? "bg-emerald-100 text-emerald-800"
                              : cat.ratio < 0.6
                              ? "bg-rose-100 text-rose-800"
                              : "bg-zinc-100 text-zinc-800"
                          }`}
                        >
                          {(cat.ratio * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="p-3">
                        {cat.action === "EXPAND_SHELF_ALLOCATION" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            EXPAND FACINGS
                          </span>
                        ) : cat.action === "FACING_REDUCTION_OR_ASSORTMENT_PRUNING" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            PRUNE ASSORTMENT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-800">
                            OPTIMAL BALANCE
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] text-zinc-600 max-w-xs">{cat.directive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
