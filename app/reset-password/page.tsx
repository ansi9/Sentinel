"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Eye, EyeOff, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { useAtom, useSetAtom } from "jotai";
import { authEmailAtom, operatorAtom } from "@/client/state/atoms";
import { AuthPageLayout } from "@/client/components/auth/AuthPageLayout";
import { AssuranceApiClient } from "@/client/lib/api-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [authEmail] = useAtom(authEmailAtom);
  const setOperator = useSetAtom(operatorAtom);

  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqLength = newPassword.length >= 8;
  const reqUpperLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const reqNumSpecial = /[\d!@#$%^&*(),.?":{}|<>]/.test(newPassword);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqLength || !reqUpperLower || !reqNumSpecial) {
      setError("Please satisfy all password requirements.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let role: "analyst" | "admin" | null = null;
      try {
        const result = await AssuranceApiClient.whoami();
        role = (result.role as "analyst" | "admin" | null) ?? null;
      } catch {
        role = "analyst";
      }

      const prefix = (authEmail || "operator").split("@")[0];
      const displayName = prefix
        .split(/[._-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");

      setOperator({
        name: displayName,
        role,
      });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
        {/* Top Reload Lock Icon */}
        <div className="flex justify-center">
          <div className="h-11 w-11 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs">
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Set new password
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-xs mx-auto">
            Your new password must be different from previous passwords.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleResetPassword} className="space-y-4">
          {/* New Password */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              NEW PASSWORD
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              CONFIRM NEW PASSWORD
            </label>
            <div className="relative">
              <input
                type={showConfirmNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm your new password"
                className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements Box */}
          <div className="rounded-lg bg-[#f1f5f9]/60 border border-slate-200/70 p-3.5 space-y-2">
            <div className="font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              PASSWORD REQUIREMENTS
            </div>
            <div className="space-y-1.5 text-xs font-sans text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={clsx("h-3.5 w-3.5", reqLength ? "text-sky-600" : "text-slate-300")}
                />
                <span className={clsx(reqLength && "text-slate-900 font-medium")}>
                  At least 8 characters long
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={clsx("h-3.5 w-3.5", reqUpperLower ? "text-sky-600" : "text-slate-300")}
                />
                <span className={clsx(reqUpperLower && "text-slate-900 font-medium")}>
                  Must include uppercase and lowercase letters
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={clsx("h-3.5 w-3.5", reqNumSpecial ? "text-sky-600" : "text-slate-300")}
                />
                <span className={clsx(reqNumSpecial && "text-slate-900 font-medium")}>
                  At least one number or special character
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Reset Password & Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-md bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-sans text-xs font-semibold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            <span>{loading ? "Updating..." : "Reset Password & Sign In"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Back to Sign In */}
        <div className="pt-2 border-t border-slate-100 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}
