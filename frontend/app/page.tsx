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

  // Focus input automatically
  useEffect(() => {
    inputRef.current?.focus();
    fetchRecentInvoices();
  }, [terminalId]);

  // Connect WebSocket to FastAPI backend for instant price & stock sync
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
          // Update cart price if item is in cart
          setCart((prev) =>
            prev.map((item) =>
              item.sku_id === data.sku_id
                ? { ...item, selling_price: data.new_price }
                : item
            )
          );
        } else if (data.type === "INVENTORY_UPDATE") {
          // Handled silently or update stock indicator
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

  // Barcode Scan Handler with Redis 800ms debounce
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

  // Atomic Checkout Execution
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

  // Strict Void Transaction (Disallow partial item unbilling post-checkout)
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

  // Ready-to-test seeded barcodes
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
      <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-white text-black font-black px-3 py-1.5 rounded text-sm tracking-wider uppercase">
            TERMINAL
          </div>
          <select
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-white px-3 py-1.5 rounded text-sm font-mono focus:outline-none focus:border-white"
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
          <span className="text-xs font-mono text-zinc-400">
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
              className="w-full bg-black border-2 border-zinc-700 focus:border-white text-white px-4 py-2 text-sm font-mono tracking-wider rounded focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-white hover:bg-zinc-200 text-black font-bold px-5 py-2 text-sm uppercase tracking-wider rounded transition-colors disabled:opacity-50"
          >
            Scan
          </button>
        </form>
      </div>

      {/* STATUS NOTIFICATION BANNER */}
      {statusMessage && (
        <div
          className={`px-4 py-2.5 rounded border text-sm font-mono tracking-wide transition-all ${
            statusMessage.type === "success"
              ? "bg-zinc-900 border-zinc-700 text-white"
              : statusMessage.type === "warning"
              ? "bg-amber-950/40 border-amber-600 text-amber-300"
              : statusMessage.type === "error"
              ? "bg-red-950/40 border-red-600 text-red-300"
              : "bg-blue-950/40 border-blue-600 text-blue-300"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* QUICK BARCODE TEST TRAYS */}
      <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
          <span>Simulation Tray (Click to Scan &bull; Double-Click Rapidly to Trigger 800ms Redis Debounce)</span>
          <span className="text-zinc-400">800ms Debounce Shield Active</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sampleBarcodes.map((item) => (
            <button
              key={item.code}
              onClick={() => handleScanBarcode(item.code)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded text-xs font-mono flex items-center gap-2 transition-colors"
            >
              <span>{item.name}</span>
              <span className="text-zinc-400">₹{item.price}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CHECKOUT SPLIT: CART TABLE + TOTALS & ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CART LINE ITEMS (2 COLS) */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col min-h-[420px]">
          <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between bg-black">
            <h2 className="font-bold text-sm uppercase tracking-wider text-white">
              Current Cart ({totalItemsCount} items)
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-mono text-zinc-400 hover:text-red-400 uppercase tracking-wider transition-colors"
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
                  <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/50 uppercase tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 text-zinc-200">
                  {cart.map((item, index) => (
                    <tr key={item.barcode} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-3 text-zinc-400">{index + 1}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white text-sm">{item.name}</div>
                        <div className="text-[11px] text-zinc-400">{item.barcode}</div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">{item.location || "Retail Floor"}</td>
                      <td className="py-3 px-3 text-right font-mono-num font-semibold text-white">
                        ₹{item.selling_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center border border-zinc-700 rounded overflow-hidden">
                          <button
                            onClick={() => updateQuantity(item.barcode, -1)}
                            className="px-2 py-0.5 hover:bg-zinc-800 text-zinc-300"
                          >
                            -
                          </button>
                          <span className="px-2 py-0.5 font-bold font-mono-num text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.barcode, 1)}
                            className="px-2 py-0.5 hover:bg-zinc-800 text-zinc-300"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-bold text-white text-sm">
                        ₹{(item.selling_price * item.quantity).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => updateQuantity(item.barcode, -item.quantity)}
                          className="text-zinc-400 hover:text-red-400"
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

        {/* TOTALS & CHECKOUT ACTIONS (1 COL) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-6">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 border-b border-zinc-800 pb-2">
              Payment & Bill Summary
            </h2>

            {/* GRAND TOTAL MONOCHROME DISPLAY */}
            <div className="bg-black border border-zinc-800 p-4 rounded text-center">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest block mb-1">
                Net Payable Amount
              </span>
              <span className="text-4xl font-black font-mono-num text-white tracking-tight">
                ₹{totalAmount.toFixed(2)}
              </span>
            </div>

            {/* PAYMENT MODE SELECTOR */}
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 block mb-2">
                Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs uppercase">
                {(["UPI", "Cash", "Card"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`py-2 rounded font-bold border transition-colors ${
                      paymentMode === mode
                        ? "bg-white text-black border-white"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {paymentMode === "UPI" && (
              <div className="border border-zinc-800 bg-zinc-900/50 p-3 rounded text-center text-xs font-mono text-zinc-400">
                <span className="text-emerald-400 font-bold block mb-1">✓ DYNAMIC QR READY</span>
                Scan UPI on POS display to complete
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 space-y-3">
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || loading}
              className="w-full bg-white hover:bg-zinc-200 text-black font-black py-4 rounded text-base uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? "LOCKING LEDGER..." : "ATOMIC CHECKOUT [ENTER]"}
            </button>
            <p className="text-[11px] text-center font-mono text-zinc-400">
              ACID Compliant &bull; Disallows Partial Post-Checkout Unbilling
            </p>
          </div>
        </div>
      </div>

      {/* COMPLETED RECEIPT MODAL */}
      {activeReceipt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-950 border border-zinc-700 max-w-md w-full p-6 rounded-lg font-mono space-y-4">
            <div className="text-center border-b border-zinc-800 pb-3">
              <h3 className="font-black text-lg text-white tracking-widest">SUPERMART RETAIL</h3>
              <p className="text-xs text-zinc-400">High-Velocity Lane Checkout</p>
            </div>
            <div className="text-xs space-y-1 text-zinc-300">
              <div>Invoice: <span className="text-white font-bold">{activeReceipt.transaction_id}</span></div>
              <div>Terminal: {activeReceipt.pos_terminal_id}</div>
              <div>Payment: {activeReceipt.payment_mode}</div>
              <div>Total: <span className="text-white font-bold text-sm">₹{activeReceipt.total_amount?.toFixed(2)}</span></div>
            </div>
            <div className="border-t border-b border-zinc-800 py-2 text-xs space-y-1">
              {activeReceipt.items?.map((it: any) => (
                <div key={it.barcode} className="flex justify-between">
                  <span>{it.name} x {it.quantity}</span>
                  <span className="font-bold text-white">₹{(it.selling_price * it.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-zinc-400 text-center">
              * Note: Strict ledger rule. No partial unbilling. Invoice must be voided in full to reverse.
            </div>
            <button
              onClick={() => setActiveReceipt(null)}
              className="w-full bg-white text-black font-bold py-2 rounded text-xs uppercase tracking-wider"
            >
              Dismiss / Next Customer
            </button>
          </div>
        </div>
      )}

      {/* RECENT INVOICES & STRICT VOID SECTION */}
      <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Recent Invoices (Atomic Ledger Audit)
          </h2>
          <span className="text-xs font-mono text-zinc-400">
            Rule: Mandatory Full Voiding (No Partial Unbilling)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/50 uppercase">
                <th className="py-2 px-3">Invoice ID</th>
                <th className="py-2 px-3">Terminal</th>
                <th className="py-2 px-3">Payment</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3">Reason / Audit</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-zinc-300">
              {recentInvoices.map((inv) => (
                <tr key={inv.transaction_id} className="hover:bg-zinc-900/30">
                  <td className="py-2.5 px-3 font-bold text-white">{inv.transaction_id}</td>
                  <td className="py-2.5 px-3 text-zinc-400">{inv.pos_terminal_id}</td>
                  <td className="py-2.5 px-3">{inv.payment_mode}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">
                    ₹{Number(inv.total_amount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        inv.status === "COMPLETED"
                          ? "bg-zinc-800 text-emerald-400 border border-emerald-900"
                          : "bg-red-950 text-red-400 border border-red-900"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400 text-[11px] max-w-xs truncate">
                    {inv.voided_reason || "Normal checkout"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {inv.status === "COMPLETED" && (
                      <button
                        onClick={() => handleVoidInvoice(inv.transaction_id)}
                        className="bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-zinc-800 hover:border-red-800 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors"
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
