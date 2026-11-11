"use client";

import React, { useState } from "react";
import {
  Users,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowDownRight,
  ShieldAlert,
  Search,
  Filter,
  Receipt
} from "lucide-react";

export default function CustomerKhataPage() {
  const [filterBucket, setFilterBucket] = useState<string>("ALL");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState<string>("");

  const [khataSummary, setKhataSummary] = useState({
    total_outstanding: 63800.0,
    total_credit_limit: 105000.0,
    active_accounts: 5,
    aging: {
      b0_15: { count: 2, amount: 5050.0 },
      b16_30: { count: 1, amount: 12500.0 },
      b31_60: { count: 1, amount: 31400.0 },
      b60_plus: { count: 1, amount: 14850.0 }
    },
    accounts: [
      {
        account_id: "KH-001",
        customer_name: "Rajesh Mining Contractors",
        phone_number: "9893011223",
        credit_limit: 25000.0,
        current_balance: 12500.0,
        last_payment_date: "2026-10-28",
        days_overdue: 14,
        bucket: "0_15",
        status: "ACTIVE"
      },
      {
        account_id: "KH-002",
        customer_name: "BSP Employees Canteen Sub-Unit 4",
        phone_number: "9425098765",
        credit_limit: 50000.0,
        current_balance: 31400.0,
        last_payment_date: "2026-10-10",
        days_overdue: 32,
        bucket: "31_60",
        status: "ACTIVE"
      },
      {
        account_id: "KH-003",
        customer_name: "Ramesh Tiwari (Mine Ward 7)",
        phone_number: "9827055443",
        credit_limit: 10000.0,
        current_balance: 4200.0,
        last_payment_date: "2026-11-02",
        days_overdue: 9,
        bucket: "0_15",
        status: "ACTIVE"
      },
      {
        account_id: "KH-004",
        customer_name: "Dalli Workers Tiffin Center",
        phone_number: "9754012399",
        credit_limit: 15000.0,
        current_balance: 14850.0,
        last_payment_date: "2026-09-05",
        days_overdue: 67,
        bucket: "60_plus",
        status: "FROZEN"
      },
      {
        account_id: "KH-005",
        customer_name: "Smt. Sunita Verma (BSP Staff)",
        phone_number: "9907033211",
        credit_limit: 5000.0,
        current_balance: 850.0,
        last_payment_date: "2026-11-05",
        days_overdue: 6,
        bucket: "0_15",
        status: "ACTIVE"
      }
    ]
  });

  const filteredAccounts = khataSummary.accounts.filter((acc) => {
    if (filterBucket === "ALL") return true;
    return acc.bucket === filterBucket;
  });

  const handleRecordPayment = () => {
    if (!selectedAccount || paymentAmount <= 0) return;
    const updatedBal = selectedAccount.current_balance - paymentAmount;
    alert(`Payment of ₹${paymentAmount} recorded for ${selectedAccount.customer_name}. Reconciled balance: ₹${updatedBal}.`);
    setSelectedAccount(null);
    setPaymentAmount(0);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Customer Khata (Local Credit) Double-Entry Ledger
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-900 border border-blue-300">
              AGING AUDIT
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Facility: 4,500 sq.ft Supermarket &bull; Dalli Rajhara &bull; Mining Township Tab Accounting &bull; Zero Leakage
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className="text-[11px] text-zinc-500">Total Outstanding</span>
            <div className="text-xl font-bold text-slate-900">
              ₹{khataSummary.total_outstanding.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* AGING BUCKETS TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterBucket("0_15")}
          className={`p-4 rounded-xl border text-left transition-all font-mono ${
            filterBucket === "0_15"
              ? "bg-blue-50 border-blue-400 ring-2 ring-blue-200"
              : "bg-white border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>0–15 Days</span>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">CURRENT</span>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-2">
            ₹{khataSummary.aging.b0_15.amount.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{khataSummary.aging.b0_15.count} Accounts</div>
        </button>

        <button
          onClick={() => setFilterBucket("16_30")}
          className={`p-4 rounded-xl border text-left transition-all font-mono ${
            filterBucket === "16_30"
              ? "bg-blue-50 border-blue-400 ring-2 ring-blue-200"
              : "bg-white border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>16–30 Days</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">REMINDER</span>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-2">
            ₹{khataSummary.aging.b16_30.amount.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{khataSummary.aging.b16_30.count} Accounts</div>
        </button>

        <button
          onClick={() => setFilterBucket("31_60")}
          className={`p-4 rounded-xl border text-left transition-all font-mono ${
            filterBucket === "31_60"
              ? "bg-blue-50 border-blue-400 ring-2 ring-blue-200"
              : "bg-white border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>31–60 Days</span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-bold">WARNING</span>
          </div>
          <div className="text-xl font-bold text-orange-800 mt-2">
            ₹{khataSummary.aging.b31_60.amount.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{khataSummary.aging.b31_60.count} Accounts</div>
        </button>

        <button
          onClick={() => setFilterBucket("60_plus")}
          className={`p-4 rounded-xl border text-left transition-all font-mono ${
            filterBucket === "60_plus"
              ? "bg-blue-50 border-blue-400 ring-2 ring-blue-200"
              : "bg-white border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>60+ Days</span>
            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">CRITICAL</span>
          </div>
          <div className="text-xl font-bold text-rose-700 mt-2">
            ₹{khataSummary.aging.b60_plus.amount.toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">{khataSummary.aging.b60_plus.count} Accounts (Freeze)</div>
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-zinc-600">
          Showing: <span className="font-bold text-zinc-900">{filterBucket}</span> ({filteredAccounts.length} accounts)
        </div>
        {filterBucket !== "ALL" && (
          <button
            onClick={() => setFilterBucket("ALL")}
            className="text-xs font-mono text-blue-700 hover:underline font-bold"
          >
            Show All Accounts
          </button>
        )}
      </div>

      {/* ACCOUNTS TABLE */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-100/75 border-b border-zinc-200 text-zinc-600 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="p-3">Account &amp; Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Credit Limit</th>
                <th className="p-3">Outstanding Balance</th>
                <th className="p-3">Utilization</th>
                <th className="p-3">Days Overdue</th>
                <th className="p-3">Account Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredAccounts.map((acc, idx) => {
                const util = (acc.current_balance / acc.credit_limit) * 100;
                return (
                  <tr key={idx} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-3 font-bold text-zinc-900">
                      {acc.customer_name}
                      <div className="text-[10px] text-zinc-500 font-normal">{acc.account_id}</div>
                    </td>
                    <td className="p-3 text-zinc-600">{acc.phone_number}</td>
                    <td className="p-3 font-bold text-zinc-800">₹{acc.credit_limit.toLocaleString()}</td>
                    <td className="p-3 font-bold text-blue-900">₹{acc.current_balance.toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-zinc-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${util > 90 ? "bg-rose-600" : util > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, util)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500">{util.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-bold ${
                          acc.days_overdue > 60
                            ? "text-rose-700"
                            : acc.days_overdue > 30
                            ? "text-orange-700"
                            : "text-zinc-700"
                        }`}
                      >
                        {acc.days_overdue} days
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          acc.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {acc.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedAccount(acc)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition-colors"
                      >
                        Record Repayment
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Record Khata Repayment</h3>
                <span className="text-xs text-zinc-500">{selectedAccount.customer_name} ({selectedAccount.account_id})</span>
              </div>
              <button onClick={() => setSelectedAccount(null)} className="text-zinc-400 hover:text-zinc-600">&times;</button>
            </div>

            <div className="text-xs space-y-3">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between">
                <span className="text-zinc-600">Current Outstanding:</span>
                <span className="font-bold text-blue-900">₹{selectedAccount.current_balance.toLocaleString()}</span>
              </div>

              <div>
                <label className="block text-zinc-700 mb-1 font-bold">Repayment Amount (₹)</label>
                <input
                  type="number"
                  placeholder="Enter amount paid"
                  value={paymentAmount || ""}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-zinc-300 rounded px-3 py-2 text-sm font-bold text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-zinc-700 mb-1 font-bold">Payment Reference / Mode</label>
                <input
                  type="text"
                  placeholder="UPI reference number or Cash receipt"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border border-zinc-300 rounded px-3 py-1.5"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                onClick={() => setSelectedAccount(null)}
                className="px-3 py-1.5 rounded border border-zinc-300 text-zinc-700 hover:bg-zinc-100 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
              >
                Reconcile &amp; Post Credit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
