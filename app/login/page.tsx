"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useSetAtom } from "jotai";
import { operatorAtom, authEmailAtom } from "@/client/state/atoms";
import { AuthPageLayout } from "@/client/components/auth/AuthPageLayout";
import { AssuranceApiClient } from "@/client/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const setOperator = useSetAtom(operatorAtom);
  const setAuthEmail = useSetAtom(authEmailAtom);

  const [email, setEmail] = useState("marcus.vance@us-defense.ai");
  const [password, setPassword] = useState("•••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
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

      const prefix = email.split("@")[0] || "Operator";
      const displayName = prefix
        .split(/[._-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");

      setAuthEmail(email);
      setOperator({
        name: displayName,
        role,
      });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
        {/* Top Lock Icon */}
        <div className="flex justify-center">
          <div className="h-11 w-11 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Sign in to CV Integrity
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed font-sans">
            Enter your credentials to access the assurance platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-4">
          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="marcus.vance@us-defense.ai"
              className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                PASSWORD
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] cursor-pointer"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Remember this device Checkbox */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="remember"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
            />
            <label
              htmlFor="remember"
              className="text-xs text-slate-600 font-sans cursor-pointer select-none"
            >
              Remember this device
            </label>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-md bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-sans text-xs font-semibold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            <span>{loading ? "Signing in..." : "Sign In"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Bottom Footer: Request access */}
        <div className="pt-2 text-center text-xs text-slate-600 font-sans">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-bold text-slate-900 hover:underline cursor-pointer"
          >
            Request access
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}
