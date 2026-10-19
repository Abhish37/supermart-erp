import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SuperMart ERP & High-Velocity POS",
  description: "High-velocity retail POS and owner-controlled ERP with real-time WebSockets and FIFO inventory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50/60 text-zinc-900 flex flex-col font-sans selection:bg-zinc-900 selection:text-white">
        {/* TOP SYSTEM BAR */}
        <header className="border-b border-zinc-200 bg-white px-6 py-3.5 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group">
                <span className="font-black text-lg tracking-wider text-white bg-black border border-black px-2.5 py-0.5 rounded-sm shadow-sm group-hover:bg-zinc-800 transition-colors">
                  SUPERMART
                </span>
                <span className="text-xs font-mono uppercase text-zinc-500 tracking-widest hidden sm:inline">
                  ERP &bull; POS
                </span>
              </Link>

              <nav className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-md hover:bg-zinc-100 text-zinc-900 font-bold transition-colors"
                >
                  POS Billing
                </Link>
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 font-medium transition-colors"
                >
                  Owner Dashboard
                </Link>
                <Link
                  href="/repackage"
                  className="px-3 py-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 font-medium transition-colors"
                >
                  Bulk Repackaging
                </Link>
                <Link
                  href="/replenishment"
                  className="px-3 py-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 font-medium transition-colors"
                >
                  Replenishment & POs
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="font-bold tracking-wider text-[11px]">WS ACTIVE (15-20 POS)</span>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="border-t border-zinc-200 bg-white py-4 text-center text-xs font-mono text-zinc-500">
          SuperMart High-Velocity POS &bull; Strict ACID Ledger Enforcement &bull; Payday Tsunami Architecture
        </footer>
      </body>
    </html>
  );
}
