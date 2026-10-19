"use client";

import React, { useState, useEffect, useRef } from "react";

interface CartItem {
  barcode: string;
  batch_id: string;
  sku_id: string;
  name: string;
  category: string;
  selling_price: number;
  quantity: number;
  location?: string;
}

interface Invoice {
  transaction_id: string;
  pos_terminal_id: string;
  total_amount: number;
  payment_mode: string;
  status: string;
  timestamp: string;
  voided_reason?: string;
}

export default function POSTerminalPage() {
  const [terminalId, setTerminalId] = useState("POS-01");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<"UPI" | "Cash" | "Card">("UPI");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "warning" | "info";
    text: string;
  } | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

  useEffect(() => {
    inputRef.current?.focus();
    fetchRecentInvoices();
  }, [terminalId]);

  // Connect WebSocket to FastAPI backend
  useEffect(() => {
    const wsUri = `${WS_URL}/pos/${terminalId}`;
    const ws = new WebSocket(wsUri);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "PRICE_UPDATE") {
          setStatusMessage({
            type: "info",
            text: `⚡ DYNAMIC PRICE UPDATE: ${data.product_name} updated to ₹${data.new_price.toFixed(2)} across all POS terminals!`,
          });
          setCart((prev) =>
            prev.map((item) =>
              item.sku_id === data.sku_id
                ? { ...item, selling_price: data.new_price }
                : item
            )
          );
        }
      } catch (e) {
        // Ping response or string
      }
    };

    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    return () => {
      ws.close();
    };
  }, [terminalId, WS_URL]);

  const fetchRecentInvoices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pos/recent-invoices?limit=8`);
      if (res.ok) {
        const data = await res.json();
        setRecentInvoices(data);
      }
    } catch (e) {
      console.error("Failed to fetch recent invoices", e);
    }
  };

  const handleScanBarcode = async (codeToScan?: string) => {
    const code = (codeToScan || barcodeInput).trim();
    if (!code) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/pos/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos_terminal_id: terminalId,
          barcode: code,
        }),
      });

      const data = await res.json();

      if (data.status === "DROPPED") {
        setStatusMessage({
          type: "warning",
          text: `⚠️ SCAN DROPPED: Duplicate scan within 800ms window on ${terminalId} (Redis Protected)`,
        });
      } else if (data.status === "ACCEPTED" && data.item) {
        const item = data.item;
        setCart((prev) => {
          const existingIdx = prev.findIndex((i) => i.barcode === item.barcode);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx].quantity += 1;
            return updated;
          } else {
            return [
              ...prev,
              {
                barcode: item.barcode,
                batch_id: item.batch_id,
                sku_id: item.sku_id,
                name: item.name,
                category: item.category,
                selling_price: item.selling_price,
                quantity: 1,
                location: item.location,
              },
            ];
          }
        });
        setStatusMessage({
          type: "success",
          text: `✓ Added: ${item.name} (₹${item.selling_price.toFixed(2)})`,
        });
      } else {
        setStatusMessage({
          type: "error",
          text: `✕ Item not found for barcode: ${code}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Error scanning: ${err.message}`,
      });
    } finally {
      setBarcodeInput("");
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const updateQuantity = (barcode: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.barcode === barcode) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => {
    setCart([]);
    setStatusMessage(null);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setStatusMessage({ type: "warning", text: "Cart is empty. Scan items first." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/pos/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos_terminal_id: terminalId,
          payment_mode: paymentMode,
          items: cart.map((i) => ({
            barcode: i.barcode,
            batch_id: i.batch_id,
            sku_id: i.sku_id,
            name: i.name,
            selling_price: i.selling_price,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Checkout transaction failed");

      setActiveReceipt(data);
      setCart([]);
      setStatusMessage({
        type: "success",
        text: `✓ CHECKOUT COMPLETED: Invoice ${data.transaction_id} locked to ledger.`,
      });
      fetchRecentInvoices();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `CHECKOUT FAILED: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVoidInvoice = async (transactionId: string) => {
    const reason = prompt(
      `MANDATORY AUDIT REASON for cancelling invoice ${transactionId}:\n(Note: Post-checkout, individual items cannot be unbilled; the entire invoice must be voided.)`
    );
    if (!reason) return;

    try {
      const res = await fetch(`${API_URL}/api/pos/void-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transactionId,
          pos_terminal_id: terminalId,
          voided_reason: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Voiding failed");

      setStatusMessage({
        type: "warning",
        text: `Invoice ${transactionId} VOIDED. All stock restored to shelf inventory.`,
      });
      fetchRecentInvoices();
    } catch (err: any) {
      alert(`Error voiding invoice: ${err.message}`);
    }
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const sampleBarcodes = [
    { name: "Sugar 1kg (Shelf)", code: "8901000100009", price: 46.0 },
    { name: "Basmati Rice 1kg", code: "8901000100023", price: 100.3 },
    { name: "Sunflower Oil 1L", code: "8901000100030", price: 123.2 },
    { name: "Wheat Atta 5kg", code: "8901000100047", price: 239.4 },
    { name: "Toor Dal 1kg", code: "8901000100054", price: 156.6 },
    { name: "Amul Butter 500g", code: "8901000100078", price: 264.0 },
    { name: "Good Day Cookies", code: "8901000100085", price: 42.7 },
  ];

  return (
    <div className="space-y-6">
      {/* TERMINAL HEADER & SCANNER BAR */}
      <div className="bg-white border border-zinc-200 shadow-xs p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-zinc-900 text-white font-black px-3 py-1.5 rounded text-sm tracking-wider uppercase">
            TERMINAL
          </div>
          <select
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="bg-zinc-50 border border-zinc-300 text-zinc-900 px-3 py-1.5 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            {Array.from({ length: 20 }, (_, i) => {
              const id = `POS-${(i + 1).toString().padStart(2, "0")}`;
              return (
                <option key={id} value={id}>
                  {id} (Lane {i + 1})
                </option>
              );
            })}
          </select>
          <span className="text-xs font-mono text-zinc-500">
            {wsConnected ? "• Connected (Low Latency)" : "• Connecting..."}
          </span>
        </div>

        {/* BARCODE SCANNER INPUT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleScanBarcode();
          }}
          className="flex-1 max-w-xl w-full flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="SCAN EAN-13 BARCODE OR ENTER SKU..."
              className="w-full bg-white border-2 border-zinc-300 focus:border-zinc-900 text-zinc-900 px-4 py-2 text-sm font-mono tracking-wider rounded-lg focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-black hover:bg-zinc-800 text-white font-bold px-5 py-2 text-sm uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50"
          >
            Scan
          </button>
        </form>
      </div>

      {/* STATUS NOTIFICATION BANNER */}
      {statusMessage && (
        <div
          className={`px-4 py-2.5 rounded-lg border text-sm font-mono tracking-wide transition-all shadow-xs ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-medium"
              : statusMessage.type === "warning"
              ? "bg-amber-50 border-amber-300 text-amber-900 font-medium"
              : statusMessage.type === "error"
              ? "bg-red-50 border-red-300 text-red-900 font-medium"
              : "bg-blue-50 border-blue-300 text-blue-900 font-medium"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* QUICK BARCODE TEST TRAYS */}
      <div className="bg-white border border-zinc-200 shadow-xs p-3.5 rounded-xl">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2.5 flex items-center justify-between">
          <span>Simulation Tray (Click to Scan &bull; Double-Click Rapidly to Trigger 800ms Redis Debounce)</span>
          <span className="text-zinc-600 font-medium">800ms Debounce Shield Active</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sampleBarcodes.map((item) => (
            <button
              key={item.code}
              onClick={() => handleScanBarcode(item.code)}
              className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-400 text-zinc-800 px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-2 transition-colors shadow-2xs"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-zinc-500 font-semibold">₹{item.price}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CHECKOUT SPLIT: CART TABLE + TOTALS & ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CART LINE ITEMS */}
        <div className="lg:col-span-2 bg-white border border-zinc-200 shadow-xs rounded-xl overflow-hidden flex flex-col min-h-[420px]">
          <div className="border-b border-zinc-200 px-4 py-3 flex items-center justify-between bg-zinc-50/70">
            <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-900">
              Current Cart ({totalItemsCount} items)
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-mono text-zinc-500 hover:text-red-600 uppercase tracking-wider transition-colors font-medium"
              >
                Clear Cart
              </button>
            )}
          </div>

          <div className="flex-1 overflow-x-auto">
            {cart.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-zinc-400 font-mono text-xs uppercase tracking-widest">
                <span>Scanner Idle</span>
                <span className="text-zinc-400 mt-1">Ready for next customer</span>
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600 bg-zinc-50/50 uppercase tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {cart.map((item, index) => (
                    <tr key={item.barcode} className="hover:bg-zinc-50 transition-colors">
                      <td className="py-3 px-3 text-zinc-400">{index + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-zinc-900 text-sm">{item.name}</div>
                        <div className="text-[11px] text-zinc-500">{item.barcode}</div>
                      </td>
                      <td className="py-3 px-3 text-zinc-600">{item.location || "Retail Floor"}</td>
                      <td className="py-3 px-3 text-right font-mono-num font-semibold text-zinc-900">
                        ₹{item.selling_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center border border-zinc-300 rounded overflow-hidden bg-white shadow-2xs">
                          <button
                            onClick={() => updateQuantity(item.barcode, -1)}
                            className="px-2 py-0.5 hover:bg-zinc-100 text-zinc-700"
                          >
                            -
                          </button>
                          <span className="px-2 py-0.5 font-bold font-mono-num text-zinc-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.barcode, 1)}
                            className="px-2 py-0.5 hover:bg-zinc-100 text-zinc-700"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-bold text-zinc-900 text-sm">
                        ₹{(item.selling_price * item.quantity).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => updateQuantity(item.barcode, -item.quantity)}
                          className="text-zinc-400 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* TOTALS & CHECKOUT ACTIONS */}
        <div className="bg-white border border-zinc-200 shadow-xs rounded-xl p-5 flex flex-col justify-between">
          <div className="space-y-6">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 border-b border-zinc-200 pb-2">
              Payment & Bill Summary
            </h2>

            {/* GRAND TOTAL DISPLAY */}
            <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl text-center">
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest block mb-1">
                Net Payable Amount
              </span>
              <span className="text-4xl font-black font-mono-num text-zinc-900 tracking-tight">
                ₹{totalAmount.toFixed(2)}
              </span>
            </div>

            {/* PAYMENT MODE SELECTOR */}
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-zinc-600 block mb-2 font-medium">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs uppercase">
                {(["UPI", "Cash", "Card"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 rounded-lg font-bold border transition-colors ${
                      paymentMode === mode
                        ? "bg-black text-white border-black shadow-xs"
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {paymentMode === "UPI" && (
              <div className="border border-emerald-200 bg-emerald-50/60 p-3 rounded-lg text-center text-xs font-mono text-emerald-900">
                <span className="text-emerald-700 font-bold block mb-1">✓ DYNAMIC QR READY</span>
                Scan UPI on POS display to complete
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-200 space-y-3">
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || loading}
              className="w-full bg-black hover:bg-zinc-800 text-white font-black py-4 rounded-xl text-base uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {loading ? "LOCKING LEDGER..." : "ATOMIC CHECKOUT [ENTER]"}
            </button>
            <p className="text-[11px] text-center font-mono text-zinc-500">
              ACID Compliant &bull; Disallows Partial Post-Checkout Unbilling
            </p>
          </div>
        </div>
      </div>

      {/* COMPLETED RECEIPT MODAL */}
      {activeReceipt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-zinc-300 shadow-2xl max-w-md w-full p-6 rounded-xl font-mono space-y-4">
            <div className="text-center border-b border-zinc-200 pb-3">
              <h3 className="font-black text-lg text-zinc-900 tracking-widest">SUPERMART RETAIL</h3>
              <p className="text-xs text-zinc-500">High-Velocity Lane Checkout</p>
            </div>
            <div className="text-xs space-y-1 text-zinc-700">
              <div>Invoice: <span className="text-zinc-900 font-bold">{activeReceipt.transaction_id}</span></div>
              <div>Terminal: {activeReceipt.pos_terminal_id}</div>
              <div>Payment: {activeReceipt.payment_mode}</div>
              <div>Total: <span className="text-zinc-900 font-bold text-sm">₹{activeReceipt.total_amount?.toFixed(2)}</span></div>
            </div>
            <div className="border-t border-b border-zinc-200 py-2 text-xs space-y-1">
              {activeReceipt.items?.map((it: any) => (
                <div key={it.barcode} className="flex justify-between text-zinc-800">
                  <span>{it.name} x {it.quantity}</span>
                  <span className="font-bold text-zinc-900">₹{(it.selling_price * it.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-zinc-500 text-center">
              * Note: Strict ledger rule. No partial unbilling. Invoice must be voided in full to reverse.
            </div>
            <button
              onClick={() => setActiveReceipt(null)}
              className="w-full bg-black text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider hover:bg-zinc-800 transition-colors"
            >
              Dismiss / Next Customer
            </button>
          </div>
        </div>
      )}

      {/* RECENT INVOICES & STRICT VOID SECTION */}
      <div className="bg-white border border-zinc-200 shadow-xs p-5 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
            Recent Invoices (Atomic Ledger Audit)
          </h2>
          <span className="text-xs font-mono text-zinc-500">
            Rule: Mandatory Full Voiding (No Partial Unbilling)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 bg-zinc-50/60 uppercase">
                <th className="py-2 px-3">Invoice ID</th>
                <th className="py-2 px-3">Terminal</th>
                <th className="py-2 px-3">Payment</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3">Reason / Audit</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {recentInvoices.map((inv) => (
                <tr key={inv.transaction_id} className="hover:bg-zinc-50/60 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-zinc-900">{inv.transaction_id}</td>
                  <td className="py-2.5 px-3 text-zinc-600">{inv.pos_terminal_id}</td>
                  <td className="py-2.5 px-3">{inv.payment_mode}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-zinc-900">
                    ₹{Number(inv.total_amount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        inv.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                          : "bg-red-50 text-red-800 border border-red-300"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-500 text-[11px] max-w-xs truncate">
                    {inv.voided_reason || "Normal checkout"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {inv.status === "COMPLETED" && (
                      <button
                        onClick={() => handleVoidInvoice(inv.transaction_id)}
                        className="bg-zinc-50 hover:bg-red-50 text-zinc-700 hover:text-red-700 border border-zinc-200 hover:border-red-300 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors shadow-2xs"
                      >
                        Void Invoice
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
