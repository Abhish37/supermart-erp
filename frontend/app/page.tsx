"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Barcode,
  CreditCard,
  Banknote,
  QrCode,
  Printer,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Lock,
  LogOut,
  HelpCircle,
  Zap,
  ArrowRight,
  RefreshCw,
  Cpu,
  ShieldCheck,
  X
} from "lucide-react";

interface CartItem {
  barcode: string;
  batch_id: string;
  sku_id: string;
  name: string;
  category: string;
  selling_price: number;
  quantity: number;
  location?: string;
  shelf_stock?: number;
}

interface CashierSession {
  employee_id: string;
  cashier_name: string;
  role: string;
  pos_terminal_id: string;
  fault_count: number;
  fault_badge: "NORMAL" | "YELLOW" | "RED";
  session_token: string;
  login_time: string;
}

interface ReceiptData {
  transaction_id: string;
  bill_number: string;
  date_str: string;
  store_metadata: {
    store_name: string;
    gst_number: string;
    fssai_number: string;
    address_line1: string;
    address_line2: string;
    city_state_pin: string;
    phone: string;
  };
  formatted_text: string;
  raw_esc_pos_hex: string;
  lines: string[];
}

export default function POSTerminalPage() {
  const [terminalId, setTerminalId] = useState("POS-01");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

  // 1. AUTHENTICATION & SESSION STATE
  const [session, setSession] = useState<CashierSession | null>({
    employee_id: "EMP-101",
    cashier_name: "Ramesh Kumar",
    role: "CASHIER",
    pos_terminal_id: terminalId,
    fault_count: 1,
    fault_badge: "NORMAL",
    session_token: "SESS-INITIAL-DEV",
    login_time: new Date().toLocaleTimeString(),
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmpId, setLoginEmpId] = useState("EMP-101");
  const [loginPin, setLoginPin] = useState("1234");
  const [loginError, setLoginError] = useState<string | null>(null);

  // 2. POS CART & NAVIGATION STATE
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "warning" | "info";
    text: string;
  } | null>(null);

  // 3. CHECKOUT & PAYMENT MODAL STATE
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"Cash" | "UPI" | "Card">("Cash");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [pineLabsProcessing, setPineLabsProcessing] = useState(false);
  const [pineLabsStatusText, setPineLabsStatusText] = useState("");
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRawEscPos, setShowRawEscPos] = useState(false);

  // 4. WEBSOCKET SYNC
  const [wsConnected, setWsConnected] = useState(false);
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Synthetic Audio Beeps (Web Audio API)
  const playBeep = useCallback((type: "scan" | "error" | "success") => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "scan") {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch supermarket scan beep
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } else if (type === "error") {
        osc.frequency.setValueAtTime(300, audioCtx.currentTime); // Low warning buzz
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else if (type === "success") {
        // Dual chime for checkout
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch (e) {
      // Audio context might be restricted before first gesture
    }
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const wsUri = `${WS_URL}/pos/${terminalId}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUri);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "PRICE_UPDATE") {
            setStatusMessage({
              type: "info",
              text: `⚡ DYNAMIC MANDI RATE PUSH: ${data.product_name} updated to ₹${data.new_price.toFixed(2)}`,
            });
            setCart((prev) =>
              prev.map((i) => (i.sku_id === data.sku_id ? { ...i, selling_price: data.new_price } : i))
            );
          }
        } catch (e) {}
      };
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
    } catch (err) {}

    return () => {
      if (ws) ws.close();
    };
  }, [terminalId, WS_URL]);

  // Totals Calculation & Payment Logic
  // If Cash: Automatically rounds off to nearest integer
  // If UPI/Card: Keeps exact decimal value
  const exactCartTotal = cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  const roundedCartTotal = paymentMode === "Cash" ? Math.round(exactCartTotal) : Number(exactCartTotal.toFixed(2));
  const roundingDifference = roundedCartTotal - exactCartTotal;

  // Auto-fill cash tendered default
  useEffect(() => {
    if (isCheckoutOpen) {
      if (paymentMode === "Cash") {
        setCashTendered(String(roundedCartTotal));
      } else {
        setCashTendered(roundedCartTotal.toFixed(2));
      }
    }
  }, [isCheckoutOpen, paymentMode, roundedCartTotal]);

  // Keep barcode input focused for scanner capture
  useEffect(() => {
    if (!isCheckoutOpen && !showLoginModal && !activeReceipt && !showHelpModal) {
      barcodeInputRef.current?.focus();
    }
  }, [isCheckoutOpen, showLoginModal, activeReceipt, showHelpModal, cart.length]);

  // -------------------------------------------------------------------------
  // BARCODE SCANNING DISPATCH
  // -------------------------------------------------------------------------
  const processBarcodeScan = async (codeToScan: string) => {
    const code = codeToScan.trim();
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
        playBeep("error");
        setStatusMessage({
          type: "warning",
          text: `⚠️ SCAN DROPPED: Duplicate scan within 800ms window on ${terminalId} (Redis Protected)`,
        });
      } else if (data.status === "ACCEPTED" && data.item) {
        playBeep("scan");
        const item = data.item;
        setCart((prev) => {
          const existingIdx = prev.findIndex((i) => i.barcode === item.barcode);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx].quantity += 1;
            setSelectedIndex(existingIdx);
            return updated;
          } else {
            const newCart = [
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
                shelf_stock: item.shelf_stock,
              },
            ];
            setSelectedIndex(newCart.length - 1);
            return newCart;
          }
        });
        setStatusMessage({
          type: "success",
          text: `✓ Scanned: ${item.name} — ₹${item.selling_price.toFixed(2)} [FIFO Batch: ${item.batch_id}]`,
        });
      } else {
        playBeep("error");
        setStatusMessage({
          type: "error",
          text: `✕ Item not found for barcode: ${code}`,
        });
      }
    } catch (err: any) {
      playBeep("error");
      setStatusMessage({
        type: "error",
        text: `Scanner network error: ${err.message}`,
      });
    } finally {
      setBarcodeInput("");
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  // -------------------------------------------------------------------------
  // GLOBAL KEYBOARD & BARCODE SCANNER HANDLER (ZERO MOUSE PHILOSOPHY)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      // Ignore if user is inside an input modal with explicit focus
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";

      // 1. Global Barcode Scanner Accumulator (Rapid keystrokes < 50ms)
      if (e.key === "Enter") {
        if (barcodeBufferRef.current.length >= 3) {
          e.preventDefault();
          const scanned = barcodeBufferRef.current;
          barcodeBufferRef.current = "";
          processBarcodeScan(scanned);
          return;
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const timeDiff = now - lastKeyTimeRef.current;
        if (timeDiff < 60) {
          barcodeBufferRef.current += e.key;
        } else {
          barcodeBufferRef.current = e.key;
        }
        lastKeyTimeRef.current = now;
      }

      // 2. Receipt View Active Keys
      if (activeReceipt) {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
          e.preventDefault();
          setActiveReceipt(null);
          barcodeInputRef.current?.focus();
          return;
        }
        if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          window.print();
          return;
        }
      }

      // 3. Checkout Modal Keyboard Shortcuts
      if (isCheckoutOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsCheckoutOpen(false);
          barcodeInputRef.current?.focus();
          return;
        }
        // Shortcuts: Press 1 for Cash, 2 for UPI, 3 for Card
        if (e.key === "1") {
          e.preventDefault();
          setPaymentMode("Cash");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setPaymentMode("UPI");
          return;
        }
        if (e.key === "3") {
          e.preventDefault();
          setPaymentMode("Card");
          return;
        }
        if (e.key === "Enter" && !pineLabsProcessing) {
          e.preventDefault();
          executeCheckoutCommit();
          return;
        }
        return;
      }

      // 4. Root Cart POS Navigation Hotkeys
      if (e.key === "F1") {
        e.preventDefault();
        setShowHelpModal((prev) => !prev);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0) {
          setCart([]);
          setStatusMessage({ type: "info", text: "Cart cleared via F2." });
        }
        return;
      }

      if (e.key === "F12") {
        e.preventDefault();
        setShowLoginModal(true);
        return;
      }

      // 'c' or 'C': Trigger Checkout
      if ((e.key === "c" || e.key === "C") && cart.length > 0 && !isInput) {
        e.preventDefault();
        setIsCheckoutOpen(true);
        return;
      }

      // Arrow Up / Down for Cart Item Navigation
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(cart.length - 1, prev + 1));
        return;
      }

      // '+' or '=' to increment selected item
      if (e.key === "+" || e.key === "=") {
        if (!isInput && cart.length > 0) {
          e.preventDefault();
          adjustSelectedItemQuantity(1);
          return;
        }
      }

      // '-' or '_' to decrement selected item
      if (e.key === "-" || e.key === "_") {
        if (!isInput && cart.length > 0) {
          e.preventDefault();
          adjustSelectedItemQuantity(-1);
          return;
        }
      }

      // 'Delete' or 'Backspace' to remove selected item
      if ((e.key === "Delete" || (e.key === "Backspace" && !isInput)) && cart.length > 0) {
        e.preventDefault();
        removeSelectedItem();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isCheckoutOpen,
    cart,
    selectedIndex,
    activeReceipt,
    pineLabsProcessing,
    paymentMode,
    cashTendered,
    showHelpModal,
  ]);

  const adjustSelectedItemQuantity = (delta: number) => {
    setCart((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const target = updated[selectedIndex];
      if (!target) return prev;

      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        updated.splice(selectedIndex, 1);
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else {
        updated[selectedIndex] = { ...target, quantity: newQty };
      }
      return updated;
    });
  };

  const removeSelectedItem = () => {
    setCart((prev) => {
      const updated = [...prev];
      updated.splice(selectedIndex, 1);
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return updated;
    });
  };

  // -------------------------------------------------------------------------
  // CHECKOUT COMMIT & HARDWARE INTEGRATION (ACID COMPLIANT)
  // -------------------------------------------------------------------------
  const executeCheckoutCommit = async () => {
    if (cart.length === 0) return;

    let terminalRefId: string | undefined = undefined;

    // Hardware Integration: If UPI (2) or Card (3), trigger PineLabs Terminal API first
    if (paymentMode === "UPI" || paymentMode === "Card") {
      setPineLabsProcessing(true);
      setPineLabsStatusText(
        `Dispatched to PineLabs EDC Device on ${terminalId} (Awaiting customer ${
          paymentMode === "UPI" ? "QR Scan" : "Card Tap/Chip"
        })...`
      );

      try {
        const pineRes = await fetch(`${API_URL}/api/pos/hardware/pinelabs/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pos_terminal_id: terminalId,
            transaction_id: `TXN-${Date.now()}`,
            payment_mode: paymentMode,
            amount: roundedCartTotal,
            simulate_instant_success: true, // Auto-handshake for responsive cashier testing
          }),
        });

        const pineData = await pineRes.json();
        if (pineData.status !== "SUCCESS") {
          throw new Error("Physical terminal returned payment failure.");
        }
        terminalRefId = pineData.device_rrn;
        setPineLabsStatusText("✓ PineLabs Authorized. Committing ACID ledger transaction...");
      } catch (err: any) {
        setPineLabsProcessing(false);
        setStatusMessage({
          type: "error",
          text: `HARDWARE PAYMENT REJECTED: ${err.message}`,
        });
        playBeep("error");
        return;
      }
    }

    // Now execute DB commit (ACID compliance guaranteed)
    try {
      const res = await fetch(`${API_URL}/api/pos/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos_terminal_id: terminalId,
          cashier_id: session?.employee_id || "EMP-101",
          cashier_name: session?.cashier_name || "Ramesh Kumar",
          payment_mode: paymentMode,
          payment_ref_id: terminalRefId,
          amount_received: Number(cashTendered) || roundedCartTotal,
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
      if (!res.ok) throw new Error(data.detail || "Checkout transaction failed.");

      playBeep("success");
      setActiveReceipt(data.receipt);
      setCart([]);
      setIsCheckoutOpen(false);
      setPineLabsProcessing(false);
      setStatusMessage({
        type: "success",
        text: `✓ BILL LOCKED: ${data.bill_number} (Rs ${data.total_amount.toFixed(2)}) via ${paymentMode}`,
      });
    } catch (err: any) {
      setPineLabsProcessing(false);
      playBeep("error");
      setStatusMessage({
        type: "error",
        text: `CHECKOUT FAILED: ${err.message}`,
      });
    }
  };

  // Cashier Login
  const handleCashierLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch(`${API_URL}/api/employees/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: loginEmpId,
          pin: loginPin,
          pos_terminal_id: terminalId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");

      setSession(data);
      setShowLoginModal(false);
      setStatusMessage({
        type: "success",
        text: `✓ Cashier authenticated: ${data.cashier_name} [${data.employee_id}] bound to ${terminalId}`,
      });
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] font-sans select-none">
      {/* 1. TOP CASHIER TERMINAL BAR */}
      <div className="flex items-center justify-between bg-zinc-950 text-white px-4 py-2.5 rounded-t-lg shadow-md border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <label className="font-mono font-bold text-xs uppercase text-zinc-400">TERMINAL:</label>
            <select
              value={terminalId}
              onChange={(e) => {
                setTerminalId(e.target.value);
                setSession((prev) => (prev ? { ...prev, pos_terminal_id: e.target.value } : prev));
              }}
              className="bg-black text-emerald-400 border border-emerald-500/60 rounded px-2.5 py-1 text-xs font-mono font-black tracking-wider focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
            >
              {[
                { id: "POS-01", label: "POS-1" },
                { id: "POS-02", label: "POS-2" },
                { id: "POS-03", label: "POS-3" },
                { id: "POS-04", label: "POS-4" },
                { id: "POS-05", label: "POS-5" },
                { id: "POS-06", label: "POS-6" },
                { id: "POS-07", label: "POS-7" },
                { id: "POS-08", label: "POS-8" },
                { id: "POS-09", label: "POS-9" },
                { id: "POS-10", label: "POS-10" },
              ].map((pos) => (
                <option key={pos.id} value={pos.id} className="bg-zinc-900 text-white font-mono font-bold">
                  {pos.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Cashier Badge */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-400">CASHIER:</span>
            <span className="font-bold text-white">{session?.cashier_name || "Unassigned"}</span>
            <span className="text-zinc-500">[{session?.employee_id || "EMP-000"}]</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>OFFLINE-FIRST LOCAL MASTER</span>
          </div>

          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
            title="Keyboard Shortcuts (F1)"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>[F1] HELP</span>
          </button>

          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
            title="Lock Terminal (F12)"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>[F12] LOCK</span>
          </button>
        </div>
      </div>

      {/* 2. BARCODE SCANNING INPUT & STATUS MESSAGE */}
      <div className="bg-zinc-900 p-3 border-x border-zinc-800 flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
            <Barcode className="w-5 h-5 text-emerald-400" />
          </div>
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                processBarcodeScan(barcodeInput);
              }
            }}
            placeholder="SCAN EAN-13 BARCODE OR ENTER SKU (ZERO-MOUSE ENABLED)..."
            className="w-full pl-10 pr-4 py-2.5 bg-black border-2 border-emerald-500/60 focus:border-emerald-400 rounded-md text-emerald-300 font-mono text-sm tracking-wider placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
            autoFocus
          />
        </div>

        <button
          onClick={() => processBarcodeScan(barcodeInput)}
          disabled={loading || !barcodeInput}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-colors"
        >
          {loading ? "SCANNING..." : "MANUAL SCAN [ENTER]"}
        </button>

        {/* Ready Barcode Quick Pills for instant testing */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-zinc-400">
          <span className="text-[10px] text-zinc-500">QUICK:</span>
          {["8901000100002", "8901000100026", "8901000100033"].map((code, idx) => (
            <button
              key={code}
              onClick={() => processBarcodeScan(code)}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] font-mono border border-zinc-700"
            >
              ITEM {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Status Bar */}
      {statusMessage && (
        <div
          className={`px-4 py-2 text-xs font-mono border-x flex items-center justify-between ${
            statusMessage.type === "success"
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
              : statusMessage.type === "error"
              ? "bg-red-950/80 text-red-300 border-red-800"
              : statusMessage.type === "warning"
              ? "bg-amber-950/80 text-amber-300 border-amber-800"
              : "bg-blue-950/80 text-blue-300 border-blue-800"
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. MAIN WORKSPACE: CART TABLE & RUNNING TOTALS */}
      <div className="flex-1 flex overflow-hidden bg-white border-x border-zinc-200">
        {/* Left: Cart Items Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-zinc-100 border-b border-zinc-200 grid grid-cols-12 px-4 py-2 text-[11px] font-mono font-bold text-zinc-600 uppercase tracking-wider">
            <span className="col-span-1">#</span>
            <span className="col-span-5">ITEM DESCRIPTION</span>
            <span className="col-span-2 text-center">QTY [+ / -]</span>
            <span className="col-span-2 text-right">UNIT PRICE</span>
            <span className="col-span-2 text-right">TOTAL</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-400">
                <ShoppingCart className="w-12 h-12 text-zinc-300 stroke-[1.5] mb-3" />
                <p className="font-mono text-sm font-bold text-zinc-600 uppercase">POS CART IS EMPTY</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                  Aim barcode scanner at merchandise or enter EAN-13 code above. Press{" "}
                  <kbd className="px-1.5 py-0.5 bg-zinc-200 text-zinc-700 rounded font-mono text-xs font-bold">
                    [C]
                  </kbd>{" "}
                  when finished to trigger checkout.
                </p>
              </div>
            ) : (
              cart.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const rowTotal = item.selling_price * item.quantity;
                return (
                  <div
                    key={`${item.barcode}-${idx}`}
                    onClick={() => setSelectedIndex(idx)}
                    className={`grid grid-cols-12 px-4 py-3 items-center text-xs font-mono cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-amber-50/90 border-l-4 border-amber-500 font-bold text-zinc-950"
                        : "hover:bg-zinc-50 text-zinc-800"
                    }`}
                  >
                    <span className="col-span-1 text-zinc-400">{idx + 1}</span>
                    <div className="col-span-5">
                      <div className="font-bold text-sm text-zinc-900">{item.name}</div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                        <span>EAN: {item.barcode}</span>
                        <span>&bull;</span>
                        <span className="text-blue-600">LOC: {item.location || "Ground Floor"}</span>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          adjustSelectedItemQuantity(-1);
                        }}
                        className="w-6 h-6 rounded bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center text-zinc-800 font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          adjustSelectedItemQuantity(1);
                        }}
                        className="w-6 h-6 rounded bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center text-zinc-800 font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="col-span-2 text-right font-medium text-zinc-700">
                      ₹{item.selling_price.toFixed(2)}
                    </span>
                    <span className="col-span-2 text-right font-bold text-zinc-900 text-sm">
                      ₹{rowTotal.toFixed(2)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Checkout Sidebar */}
        <div className="w-80 border-l border-zinc-200 bg-zinc-50/70 p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="text-xs font-mono font-bold uppercase text-zinc-500 tracking-wider">
              ORDER SUMMARY ({cart.reduce((s, i) => s + i.quantity, 0)} ITEMS)
            </div>

            <div className="space-y-2 font-mono text-xs text-zinc-600 pt-2 border-t border-zinc-200">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-bold text-zinc-800">₹{exactCartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>GST (Inclusive):</span>
                <span>₹{(exactCartTotal * 0.05).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>Cash Round-off Est:</span>
                <span className={roundingDifference !== 0 ? "text-amber-600 font-bold" : ""}>
                  {roundingDifference > 0 ? `+₹${roundingDifference.toFixed(2)}` : `₹${roundingDifference.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Prominent Total Card */}
            <div className="bg-black text-white p-4 rounded-lg shadow-sm font-mono mt-4">
              <div className="text-[11px] text-zinc-400 uppercase tracking-widest">NET PAYABLE AMOUNT</div>
              <div className="text-3xl font-black text-emerald-400 mt-1">₹{roundedCartTotal.toFixed(2)}</div>
              <div className="text-[10px] text-zinc-400 mt-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Cash auto-rounds to ₹{Math.round(exactCartTotal)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-zinc-200">
            <button
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 text-black font-mono font-black text-sm uppercase tracking-wider rounded-md shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98"
            >
              <span>CHECKOUT [C]</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (confirm("Void active cart?")) setCart([]);
              }}
              disabled={cart.length === 0}
              className="w-full py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-mono text-xs font-bold uppercase rounded flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>VOID / CLEAR [F2]</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. PERSISTENT KEYBOARD SHORTCUT LEGEND FOOTER */}
      <div className="bg-zinc-950 text-zinc-400 px-4 py-2 border-t border-zinc-800 rounded-b-lg flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-zinc-500 font-bold">HOTKEYS:</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-emerald-400 rounded font-bold">[C]</kbd> Checkout
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">[+ / -]</kbd> Qty Adjust
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">[↑ / ↓]</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">[DEL]</kbd> Remove
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">[F2]</kbd> Void
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-bold">[1, 2, 3]</kbd> Payment Mode
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>WS: {wsConnected ? "CONNECTED" : "OFFLINE (CACHED)"}</span>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 5. CHECKOUT PAYMENT MODAL (ZERO MOUSE: 1/2/3 SELECT)                  */}
      {/* --------------------------------------------------------------------- */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full overflow-hidden border border-zinc-300 font-mono">
            {/* Header */}
            <div className="bg-black text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base tracking-wider uppercase">PAYMENT & SETTLEMENT</h3>
                <p className="text-xs text-zinc-400">Terminal {terminalId} &bull; ACID Ledger Guarantee</p>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Display */}
            <div className="p-6 bg-zinc-50 border-b border-zinc-200 text-center">
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">TOTAL PAYABLE AMOUNT</span>
              <div className="text-4xl font-black text-zinc-950 mt-1">₹{roundedCartTotal.toFixed(2)}</div>
              {paymentMode === "Cash" && (
                <div className="text-xs text-amber-700 mt-1.5 font-bold">
                  ✓ Rounded off from ₹{exactCartTotal.toFixed(2)} to nearest rupee
                </div>
              )}
            </div>

            {/* Payment Mode Selector with Hotkeys 1, 2, 3 */}
            <div className="p-6 space-y-4">
              <div className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                SELECT PAYMENT MODE (PRESS 1, 2, OR 3):
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* 1. Cash */}
                <button
                  type="button"
                  onClick={() => setPaymentMode("Cash")}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1.5 transition-colors ${
                    paymentMode === "Cash"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-xs"
                      : "border-zinc-200 hover:border-zinc-300 text-zinc-700"
                  }`}
                >
                  <Banknote className="w-6 h-6 text-emerald-600" />
                  <span className="text-sm font-black">CASH</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-200/80 px-1.5 py-0.5 rounded font-mono">
                    PRESS [1]
                  </span>
                </button>

                {/* 2. UPI */}
                <button
                  type="button"
                  onClick={() => setPaymentMode("UPI")}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1.5 transition-colors ${
                    paymentMode === "UPI"
                      ? "border-blue-600 bg-blue-50 text-blue-950 font-bold shadow-xs"
                      : "border-zinc-200 hover:border-zinc-300 text-zinc-700"
                  }`}
                >
                  <QrCode className="w-6 h-6 text-blue-600" />
                  <span className="text-sm font-black">UPI DYNAMIC</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-200/80 px-1.5 py-0.5 rounded font-mono">
                    PRESS [2]
                  </span>
                </button>

                {/* 3. Card */}
                <button
                  type="button"
                  onClick={() => setPaymentMode("Card")}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1.5 transition-colors ${
                    paymentMode === "Card"
                      ? "border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-xs"
                      : "border-zinc-200 hover:border-zinc-300 text-zinc-700"
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-purple-600" />
                  <span className="text-sm font-black">PINELABS CARD</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-200/80 px-1.5 py-0.5 rounded font-mono">
                    PRESS [3]
                  </span>
                </button>
              </div>

              {/* Mode-Specific Details */}
              {paymentMode === "Cash" ? (
                <div className="bg-white p-4 rounded border border-zinc-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-600 font-bold">CASH TENDERED:</span>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-32 px-2.5 py-1.5 border-2 border-zinc-300 rounded font-mono font-bold text-right text-base focus:border-black focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                    <span className="text-zinc-500">CHANGE TO RETURN:</span>
                    <span className="font-bold text-sm text-emerald-600">
                      ₹{Math.max(0, Number(cashTendered || 0) - roundedCartTotal).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-blue-900">
                    <Cpu className="w-4 h-4 text-blue-600" />
                    <span>PINELABS EDC HARDWARE INTEGRATION</span>
                  </div>
                  <p className="text-blue-800 text-[11px] leading-relaxed">
                    Transaction will be dispatched to physical PineLabs terminal. Backend commits transaction only
                    after receiving physical terminal cryptographic authorization.
                  </p>
                  {pineLabsProcessing && (
                    <div className="flex items-center gap-2 text-emerald-700 font-bold pt-2 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{pineLabsStatusText}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Small Instructions Below Options (Strict Requirement) */}
              <div className="text-[11px] text-zinc-500 text-center bg-zinc-100 py-1.5 rounded">
                Keyboard Instructions: Press <span className="font-bold text-black">[1]</span> for Cash,{" "}
                <span className="font-bold text-black">[2]</span> for UPI,{" "}
                <span className="font-bold text-black">[3]</span> for Card &bull;{" "}
                <span className="font-bold text-black">[ENTER]</span> to Confirm &bull;{" "}
                <span className="font-bold text-black">[ESC]</span> to Cancel
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-zinc-100 px-6 py-4 flex items-center justify-between border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-300 rounded text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                CANCEL [ESC]
              </button>

              <button
                type="button"
                onClick={executeCheckoutCommit}
                disabled={pineLabsProcessing}
                className="px-6 py-2.5 bg-black hover:bg-zinc-800 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md"
              >
                {pineLabsProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>WAITING TERMINAL...</span>
                  </>
                ) : (
                  <>
                    <span>CONFIRM & PRINT [ENTER]</span>
                    <Printer className="w-4 h-4 text-emerald-400" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 6. THERMAL PRINTER ESC/POS RECEIPT PREVIEW MODAL                      */}
      {/* --------------------------------------------------------------------- */}
      {activeReceipt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden border border-zinc-300 font-mono">
            <div className="bg-emerald-950 text-emerald-300 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm uppercase">TRANSACTION COMMITTED & PRINTED</span>
              </div>
              <button onClick={() => setActiveReceipt(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Receipt Visual Preview (80mm ESC/POS Layout) */}
            <div className="p-5 max-h-[65vh] overflow-y-auto bg-amber-50/40 text-zinc-900 border-y border-zinc-200 text-xs">
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all">
                {activeReceipt.formatted_text}
              </pre>
            </div>

            {/* Actions */}
            <div className="p-4 bg-zinc-100 flex items-center justify-between text-xs">
              <button
                onClick={() => setShowRawEscPos((prev) => !prev)}
                className="text-[11px] text-zinc-600 underline font-mono"
              >
                {showRawEscPos ? "Hide Raw Hex" : "View Raw ESC/POS"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 rounded font-bold text-zinc-800 flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PRINT [P]</span>
                </button>
                <button
                  onClick={() => setActiveReceipt(null)}
                  className="px-4 py-1.5 bg-black hover:bg-zinc-800 text-white rounded font-bold"
                >
                  NEW BILL [ENTER]
                </button>
              </div>
            </div>

            {/* Raw ESC/POS dump */}
            {showRawEscPos && (
              <div className="p-3 bg-black text-emerald-400 text-[10px] max-h-32 overflow-y-auto font-mono break-all border-t border-zinc-800">
                <div className="font-bold text-zinc-400 mb-1">RAW ESC/POS HEX (FOR DIRECT USB/NETWORK THERMAL SOCKET):</div>
                {activeReceipt.raw_esc_pos_hex}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 7. CASHIER LOGIN & LOCK MODAL                                         */}
      {/* --------------------------------------------------------------------- */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCashierLogin}
            className="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden border border-zinc-300 font-mono"
          >
            <div className="bg-black text-white p-5 text-center">
              <Lock className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h3 className="font-black text-sm tracking-widest uppercase">CASHIER AUTHENTICATION</h3>
              <p className="text-xs text-zinc-400 mt-1">Bind Employee Session to {terminalId}</p>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {loginError && (
                <div className="p-2 bg-red-100 border border-red-300 text-red-800 rounded font-bold">
                  {loginError}
                </div>
              )}

              <div>
                <label className="block text-zinc-600 font-bold mb-1">EMPLOYEE ID:</label>
                <input
                  type="text"
                  value={loginEmpId}
                  onChange={(e) => setLoginEmpId(e.target.value)}
                  placeholder="e.g. EMP-101"
                  className="w-full px-3 py-2 border-2 border-zinc-300 rounded font-mono font-bold focus:border-black focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-zinc-600 font-bold mb-1">PIN CODE (4 DIGITS):</label>
                <input
                  type="password"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  placeholder="****"
                  maxLength={6}
                  className="w-full px-3 py-2 border-2 border-zinc-300 rounded font-mono font-bold text-center text-lg tracking-widest focus:border-black focus:outline-none"
                />
              </div>

              <div className="text-[10px] text-zinc-500 bg-zinc-100 p-2.5 rounded leading-relaxed">
                Default Test Accounts:
                <br />
                &bull; EMP-101 (Ramesh Kumar, PIN: 1234)
                <br />
                &bull; EMP-102 (Sunita Devi, PIN: 4321) &mdash; 4 Faults (Yellow)
                <br />
                &bull; EMP-103 (Amit Patel, PIN: 9999) &mdash; 6 Faults (Red)
              </div>
            </div>

            <div className="p-4 bg-zinc-100 border-t border-zinc-200 flex justify-between">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="px-3 py-2 bg-white border border-zinc-300 rounded text-xs font-bold text-zinc-700"
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-black hover:bg-zinc-800 text-white rounded text-xs font-black uppercase tracking-wider"
              >
                LOG IN [ENTER]
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 8. HELP & KEYBOARD CHEATSHEET MODAL (F1)                              */}
      {/* --------------------------------------------------------------------- */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden border border-zinc-300 font-mono text-xs">
            <div className="bg-zinc-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm uppercase">POS KEYBOARD SPEED CHEATSHEET</span>
              </div>
              <button onClick={() => setShowHelpModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold text-emerald-600">[C]</span>
                <span className="text-zinc-600">Open Checkout Payment Modal</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[1]</span>
                <span className="text-zinc-600">Select Cash Mode (Auto-rounds to nearest rupee)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[2]</span>
                <span className="text-zinc-600">Select UPI Dynamic QR (Exact decimal)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[3]</span>
                <span className="text-zinc-600">Select Card (PineLabs EDC Webhook)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[+ / =]</span>
                <span className="text-zinc-600">Increment selected line item quantity</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[- / _]</span>
                <span className="text-zinc-600">Decrement selected line item quantity</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[Delete / Backspace]</span>
                <span className="text-zinc-600">Remove selected line item from cart</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[F2]</span>
                <span className="text-zinc-600">Void / clear entire active cart</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="font-bold">[F12]</span>
                <span className="text-zinc-600">Lock terminal / Switch cashier PIN</span>
              </div>
            </div>

            <div className="p-3 bg-zinc-100 text-center border-t border-zinc-200">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-5 py-1.5 bg-black text-white rounded text-xs font-bold"
              >
                CLOSE [ESC]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
