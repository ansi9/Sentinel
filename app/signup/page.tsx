"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useSetAtom } from "jotai";
import { authEmailAtom } from "@/client/state/atoms";
import { AuthPageLayout } from "@/client/components/auth/AuthPageLayout";

export default function SignUpPage() {
  const router = useRouter();
  const setAuthEmail = useSetAtom(authEmailAtom);

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !workEmail.trim()) {
      setError("Please complete all required fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreeTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setAuthEmail(workEmail.trim());
    router.push("/verify-email");
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-5">
        {/* Title & Subtitle */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Create your account
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed font-sans">
            Join CV Integrity to inspect and evaluate vision models
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignUp} className="space-y-3.5">
          {/* Full Name */}
          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              FULL NAME
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
            />
          </div>

          {/* Work Email */}
          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              WORK EMAIL
            </label>
            <input
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="jane.doe@organization.com"
              className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
            />
          </div>

          {/* Organization / Team */}
          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              ORGANIZATION / TEAM
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Computer Vision Research Lab"
              className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              PASSWORD
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••••••••"
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

          {/* Confirm Password */}
          <div className="space-y-1">
            <label className="block font-mono text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              CONFIRM PASSWORD
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="•••••••••••••"
                className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Strength */}
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-slate-500 font-mono text-[11px]">Password Strength</span>
            <span className="font-semibold text-[#0284c7] font-mono text-[11px]">
              {password.length >= 8 ? "Strong" : "Pending"}
            </span>
          </div>

          {/* Terms Checkbox */}
          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="agree"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer mt-0.5"
            />
            <label
              htmlFor="agree"
              className="text-xs text-slate-600 font-sans cursor-pointer select-none leading-relaxed"
            >
              I agree to the{" "}
              <span className="text-[#0284c7] hover:underline font-medium">Terms of Service</span>{" "}
              and{" "}
              <span className="text-[#0284c7] hover:underline font-medium">Privacy Policy</span>.
            </label>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Create Account Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-md bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <span>CREATE ACCOUNT</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Bottom Footer: Sign in link */}
        <div className="pt-2 text-center text-xs text-slate-600 font-sans">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-slate-900 hover:underline cursor-pointer">
            Sign in
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}
