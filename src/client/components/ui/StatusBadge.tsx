"use client";

import React from "react";
import clsx from "clsx";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "md",
  className,
}) => {
  const norm = status?.toUpperCase() || "UNKNOWN";

  let tone: "emerald" | "amber" | "rose" | "sky" | "zinc" = "zinc";

  if (
    [
      "ACCEPT",
      "VERIFIED",
      "LOW",
      "NORMAL",
      "VALID",
      "MATCH",
      "PROBABLE_OPERATIONAL_DRIFT",
    ].includes(norm)
  ) {
    tone = "emerald";
  } else if (
    [
      "PASS",
    ].includes(norm)
  ) {
    tone = "sky";
  } else if (
    [
      "REVIEW",
      "MEDIUM",
      "WARN",
      "ANOMALIES_DETECTED",
      "PARTIAL",
      "ANOMALY_REQUIRES_REVIEW",
      "NO_REFERENCE",
    ].includes(norm)
  ) {
    tone = "amber";
  } else if (
    [
      "QUARANTINE",
      "FAIL",
      "HIGH",
      "CRITICAL",
      "TAMPERING_DETECTED",
      "COMPROMISED",
      "MISMATCH",
      "ANOMALOUS",
      "MANIPULATION_INDICATORS_PRESENT",
    ].includes(norm)
  ) {
    tone = "rose";
  } else if (["INSUFFICIENT_EVIDENCE", "HASH_ONLY"].includes(norm)) {
    tone = "zinc";
  }

  const colorClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-300",
    sky: "bg-sky-50 text-sky-700 border-sky-300",
    amber: "bg-amber-50 text-amber-800 border-amber-300",
    rose: "bg-rose-50 text-rose-700 border-rose-300",
    zinc: "bg-slate-100 text-slate-700 border-slate-200",
  }[tone];

  const dotClasses = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    zinc: "bg-slate-400",
  }[tone];

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] font-mono",
    md: "px-2.5 py-0.5 text-xs font-mono font-bold tracking-wide",
    lg: "px-3.5 py-1 text-sm font-mono font-bold tracking-wider",
  }[size];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded border uppercase font-medium",
        sizeClasses,
        colorClasses,
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full shrink-0", dotClasses)} />
      <span>{norm}</span>
    </span>
  );
};
