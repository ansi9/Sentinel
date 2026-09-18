"use client";

import React from "react";
import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Home,
  BarChart2,
  AlertOctagon,
  FileText,
  ShieldCheck,
  Settings,
  Network,
  Compass,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { operatorAtom } from "@/client/state/atoms";

export type NavItemKey =
  | "home"
  | "assessments"
  | "findings"
  | "reports"
  | "audit"
  | "federated"
  | "drift"
  | "settings";

interface AppSidebarProps {
  activeTab?: NavItemKey;
  onNavigate?: (tab: NavItemKey) => void;
  onNewAssessment?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab: propActiveTab,
  onNavigate,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const operator = useAtomValue(operatorAtom);

  const getActiveTab = (): NavItemKey => {
    if (propActiveTab) return propActiveTab;
    if (pathname.startsWith("/assessments")) return "assessments";
    if (pathname.startsWith("/findings")) return "findings";
    if (pathname.startsWith("/reports")) return "reports";
    if (pathname.startsWith("/audit")) return "audit";
    if (pathname.startsWith("/federated")) return "federated";
    if (pathname.startsWith("/drift")) return "drift";
    if (pathname.startsWith("/settings")) return "settings";
    return "home";
  };

  const activeTab = getActiveTab();

  const navItems = [
    { key: "home" as const, label: "Home", href: "/", icon: Home },
    {
      key: "assessments" as const,
      label: "Assessments",
      href: "/assessments",
      icon: BarChart2,
    },
    {
      key: "findings" as const,
      label: "Findings",
      href: "/findings",
      icon: AlertOctagon,
    },
    {
      key: "reports" as const,
      label: "Reports",
      href: "/reports",
      icon: FileText,
    },
    {
      key: "audit" as const,
      label: "Audit",
      href: "/audit",
      icon: ShieldCheck,
    },
    {
      key: "federated" as const,
      label: "Federated",
      href: "/federated",
      icon: Network,
    },
    {
      key: "drift" as const,
      label: "Drift",
      href: "/drift",
      icon: Compass,
    },
    {
      key: "settings" as const,
      label: "Settings",
      href: "/settings",
      icon: Settings,
    },
  ];

  const handleItemClick = (key: NavItemKey, href: string) => {
    if (onNavigate) {
      onNavigate(key);
    } else {
      router.push(href);
    }
  };

  const initials = operator?.name
    ? operator.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "OP";

  return (
    <aside className="w-56 bg-white text-slate-800 border-r border-slate-200/90 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-20 font-sans">
      {/* Top Header & Main Navigation */}
      <div className="pb-4">
        {/* macOS Window Controls Drag Header - 56px clearance for traffic lights */}
        <div
          className="h-14 shrink-0 w-full select-none"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          aria-hidden="true"
        />

        {/* Brand Header — Aligned flush to x:20 with macOS traffic lights & nav icons */}
        <div className="pl-5 pr-4 pb-5 pt-2">
          <Link
            href="/"
            className="inline-flex items-center group"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Image
              src="/logo.png"
              alt="Sentinel — Pre-Training Vision AI Data Firewall"
              width={172}
              height={38}
              priority
              className="h-8 w-auto max-w-[172px] object-contain transition-transform group-hover:scale-[1.02]"
            />
          </Link>
        </div>

        {/* Navigation Items List */}
        <nav className="space-y-1 px-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleItemClick(item.key, item.href)}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all text-left cursor-pointer group relative",
                  isActive
                    ? "bg-slate-100 text-slate-950 font-bold border-r-2 border-sky-500 rounded-r-none"
                    : "text-slate-600 hover:text-slate-950 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={clsx(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive
                        ? "text-slate-950 stroke-[2.2]"
                        : "text-slate-500 group-hover:text-slate-800 stroke-[1.8]",
                    )}
                  />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Widget */}
      <div className="p-4 border-t border-slate-100" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {operator ? (
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-slate-900 text-white font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-bold text-slate-900 truncate">
                {operator.name}
              </div>
              <div className="font-mono text-[10px] text-slate-400 truncate uppercase">
                {operator.role ? `Role: ${operator.role}` : "Air-Gap Station"}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>
              System: <strong className="text-slate-800">AIR-GAPPED</strong>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
