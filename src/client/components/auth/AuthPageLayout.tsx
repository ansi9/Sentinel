"use client";

import React from "react";
import Image from "next/image";
import { Shield } from "lucide-react";

interface AuthPageLayoutProps {
  children: React.ReactNode;
}

export const AuthPageLayout: React.FC<AuthPageLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between antialiased font-sans relative">
      {/* Top Header Clearance Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200/80 bg-white/70 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <Image
            src="/logo_withoutlabel.png"
            alt="Sentinel Logo"
            width={24}
            height={24}
            className="h-6 w-auto object-contain"
          />
          <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 tracking-wider">
            ZERO-TRUST INGESTION // PRE-TRAINING DATA FIREWALL
          </span>
        </div>
        <div className="text-xs font-mono text-slate-500 font-medium">
          Sentinel AI
        </div>
      </header>

      {/* Main Centered Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-4">
        {children}
      </div>

      {/* Bottom Footer Info */}
      <footer className="w-full px-6 py-4 flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-200/80 bg-white/50">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-emerald-600" />
          <span>Local Air-Gap Security Enforced</span>
        </div>
        <div>SHA-256 Tamper-Evident Ledger Active</div>
      </footer>
    </div>
  );
};
