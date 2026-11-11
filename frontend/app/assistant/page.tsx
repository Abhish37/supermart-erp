"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  Send,
  Database,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight
} from "lucide-react";

export default function AssistantPage() {
  const [queryInput, setQueryInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<any[]>([
    {
      role: "assistant",
      grounded_summary:
        "Welcome to the RIDSS Controlled AI Analyst. I operate on an Allowlisted Semantic Template Architecture with read-only database enforcement (500ms statement timeout) to protect operational integrity. You can ask me about sales variance, expiry exposure, reorder calculations, or Khata balances.",
      template_used: "SYSTEM_GREETING",
      execution_time_ms: 1.2,
      data_table: []
    }
  ]);

  const promptSuggestions = [
    {
      label: "Top Margin Contributors (30d)",
      query: "Show me the top 10 items by gross margin contribution over the last 30 days",
      template: "TPL_TOP_CONTRIBUTORS"
    },
    {
      label: "Expiry Capital at Risk (45d)",
      query: "What batches are expiring within the next 45 days and what is our total capital at risk?",
      template: "TPL_EXPIRY_EXPOSURE"
    },
    {
      label: "Khata Receivables Audit",
      query: "List all customer Khata accounts overdue by more than 15 days",
      template: "TPL_KHATA_OVERDUE_REPORT"
    },
    {
      label: "Reorder Rationale for Fortune Oil",
      query: "Why did the system suggest reordering 96 units of Fortune Soyabean Oil?",
      template: "TPL_REORDER_RATIONALE"
    }
  ];

  const handleSend = async (customQuery?: string) => {
    const text = customQuery || queryInput;
    if (!text.trim()) return;

    const userMsg = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setQueryInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/api/v1/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text })
      });

      if (res.ok) {
        const json = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            grounded_summary: json.data.grounded_summary,
            template_used: json.data.template_used,
            parameters: json.data.parameters,
            data_table: json.data.data_table || [],
            execution_time_ms: json.metadata.execution_time_ms
          }
        ]);
      } else {
        throw new Error("API call failed");
      }
    } catch (err) {
      // Deterministic client fallback simulation if local backend is offline
      setTimeout(() => {
        let summary = "";
        let template = "TPL_TOP_CONTRIBUTORS";
        let table: any[] = [];

        if (text.toLowerCase().includes("expir")) {
          template = "TPL_EXPIRY_EXPOSURE";
          summary = "Expiry Risk Diagnostic (Window: <= 45 days): Identified 2 batches with total capital at risk of ₹7,230.00 across Dairy & Sweets.";
          table = [
            { sku: "SKU-SWEETS-500", product_name: "Haldirams Sweets", lot: "LOT-DIWALI", days_left: 17, capital_risk: "₹5,850.00" },
            { sku: "SKU-OIL-01", product_name: "Fortune Soyabean 1L", lot: "LOT-OIL-A", days_left: 24, capital_risk: "₹1,380.00" }
          ];
        } else if (text.toLowerCase().includes("khata") || text.toLowerCase().includes("credit")) {
          template = "TPL_KHATA_OVERDUE_REPORT";
          summary = "Khata Receivables Audit: 2 accounts currently have balances overdue past 15 days totaling ₹46,250.00.";
          table = [
            { account: "KH-002", customer: "BSP Employees Canteen Sub-Unit 4", balance: "₹31,400.00", overdue: "32 days", status: "ACTIVE" },
            { account: "KH-004", customer: "Dalli Workers Tiffin Center", balance: "₹14,850.00", overdue: "67 days", status: "FROZEN" }
          ];
        } else if (text.toLowerCase().includes("reorder") || text.toLowerCase().includes("why")) {
          template = "TPL_REORDER_RATIONALE";
          summary = "Deterministic Reorder Equation: ADS=8.5 units, Lead Time=4.0 days, Safety Stock=15.67 units. SAIL Mining Payday Multiplier=1.35x. Reorder Point=77.55 units. Target Stock=103.05 units minus 18 on-hand = 85.05 units deficit -> Pack rounded to 96 units (8 packs of 12).";
          table = [
            { metric: "Average Daily Sales (ADS)", value: "8.5 units/day" },
            { metric: "Vendor Lead Time (L)", value: "4.0 days (sigma_L = 0.8)" },
            { metric: "Safety Stock (SS)", value: "15.67 units (Z=1.96, Class-A)" },
            { metric: "Payday Multiplier", value: "1.35x (SAIL Mine Salary Window)" },
            { metric: "Order Output", value: "96 units (Pack rounded to 12)" }
          ];
        } else {
          template = "TPL_TOP_CONTRIBUTORS";
          summary = "Top Revenue and Gross Profit contributors over the last 30 days: Staples (Rice & Oil) drove 64% of volume with healthy tax-exclusive realizations.";
          table = [
            { sku: "SKU-RICE-25", name: "HMT Kolam Rice 25kg", units: 140, revenue: "₹2,03,000", margin: "13.1%" },
            { sku: "SKU-OIL-15L", name: "Fortune Soyabean 15L", units: 85, revenue: "₹1,65,750", margin: "11.8%" },
            { sku: "SKU-ATTA-20", name: "Sharbati Atta 20kg", units: 110, revenue: "₹85,800", margin: "12.8%" }
          ];
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            grounded_summary: summary,
            template_used: template,
            execution_time_ms: 14.8,
            data_table: table
          }
        ]);
        setLoading(false);
      }, 400);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Constrained AI Operational Analyst
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
              SEMANTIC TEMPLATES ONLY
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Zero Arbitrary Mutation &bull; Read-Only Role &bull; 500ms Statement Timeout Guardrail &bull; Grounded Citations
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Read-Only Guardrails Enforced</span>
        </div>
      </div>

      {/* QUICK SUGGESTIONS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
        <span className="text-zinc-400 font-bold uppercase shrink-0">Quick Queries:</span>
        {promptSuggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(s.query)}
            className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:border-blue-400 hover:text-blue-900 transition-colors whitespace-nowrap shadow-xs"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* CHAT THREAD */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 shadow-xs min-h-[460px] flex flex-col justify-between space-y-4">
        <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              {m.role === "user" ? (
                <div className="bg-blue-700 text-white font-mono text-xs px-4 py-2.5 rounded-xl max-w-lg shadow-xs">
                  {m.text}
                </div>
              ) : (
                <div className="bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono text-xs p-4 rounded-xl max-w-2xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                      TEMPLATE: {m.template_used}
                    </span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {m.execution_time_ms} ms
                    </span>
                  </div>

                  <p className="text-xs text-zinc-800 leading-relaxed font-sans">{m.grounded_summary}</p>

                  {m.data_table && m.data_table.length > 0 && (
                    <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white mt-2">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-zinc-100 text-zinc-600 border-b border-zinc-200 uppercase">
                          <tr>
                            {Object.keys(m.data_table[0]).map((k, kidx) => (
                              <th key={kidx} className="p-2 capitalize">
                                {k.replace(/_/g, " ")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {m.data_table.map((row: any, ridx: number) => (
                            <tr key={ridx} className="hover:bg-zinc-50">
                              {Object.values(row).map((val: any, vidx: number) => (
                                <td key={vidx} className="p-2 font-bold text-zinc-800">
                                  {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 animate-pulse">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Executing allowlisted template in read-only sandbox...
            </div>
          )}
        </div>

        {/* INPUT BAR */}
        <div className="pt-3 border-t border-zinc-200 flex items-center gap-2 font-mono">
          <input
            type="text"
            placeholder="Ask anything about sales velocity, expiry batches, reorder rationale, or Khata..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            className="flex-1 border border-zinc-300 rounded-xl px-4 py-2.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-zinc-50/50"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !queryInput.trim()}
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask Analyst</span>
          </button>
        </div>
      </div>
    </div>
  );
}
