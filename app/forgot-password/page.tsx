"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { useSetAtom } from "jotai";
import { authEmailAtom } from "@/client/state/atoms";
import { AuthPageLayout } from "@/client/components/auth/AuthPageLayout";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const setAuthEmail = useSetAtom(authEmailAtom);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setAuthEmail(email.trim());
    router.push("/reset-password");
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
            Reset your password
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-xs mx-auto">
            Enter the email address associated with your account, and we will send you a link to reset your password.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 font-sans">
              Email address
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-10 pr-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
              {error}
            </div>
          )}

          {/* Send Reset Link Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-md bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-sans text-xs font-semibold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <span>Send Reset Link</span>
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
