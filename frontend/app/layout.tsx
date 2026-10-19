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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
        {/* TOP SYSTEM BAR */}
        <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-3 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2">
                <span className="font-black text-lg tracking-wider text-white border border-white px-2 py-0.5 rounded-sm">
                  SUPERMART
                </span>
                <span className="text-xs font-mono uppercase text-zinc-400 tracking-widest hidden sm:inline">
                  ERP &bull; POS
                </span>
              </Link>

              <nav className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider">
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded hover:bg-zinc-800 text-white font-bold transition-colors"
                >
                  POS Billing
                </Link>
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  Owner Dashboard
                </Link>
                <Link
                  href="/repackage"
                  className="px-3 py-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  Bulk Repackaging
                </Link>
                <Link
                  href="/replenishment"
                  className="px-3 py-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  Replenishment & POs
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold tracking-wider">WS ACTIVE (15-20 POS)</span>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="border-t border-zinc-900 bg-zinc-950 py-3 text-center text-xs font-mono text-zinc-400">
          SuperMart High-Velocity POS &bull; Strict ACID Ledger Enforcement &bull; Payday Tsunami Architecture
        </footer>
      </body>
    </html>
  );
}
