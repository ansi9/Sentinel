"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Check, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { useAtom, useSetAtom } from "jotai";
import { authEmailAtom, operatorAtom } from "@/client/state/atoms";
import { AuthPageLayout } from "@/client/components/auth/AuthPageLayout";
import { AssuranceApiClient } from "@/client/lib/api-client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [authEmail] = useAtom(authEmailAtom);
  const setOperator = useSetAtom(operatorAtom);

  const [otp, setOtp] = useState<string[]>(["8", "4", "1", "", "", ""]);
  const [timerSeconds, setTimerSeconds] = useState(263); // 04:23
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, "");
    const updated = [...otp];
    if (cleaned.length > 1) {
      const digits = cleaned.slice(0, 6).split("");
      digits.forEach((d, i) => {
        if (i < 6) updated[i] = d;
      });
      setOtp(updated);
      const nextIdx = Math.min(digits.length, 5);
      otpInputRefs.current[nextIdx]?.focus();
    } else {
      updated[index] = cleaned;
      setOtp(updated);
      if (cleaned && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      setError("Please enter the complete 6-digit verification code.");
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
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const maskedEmail = authEmail
    ? `${authEmail.substring(0, 1)}***${authEmail.substring(Math.max(1, authEmail.indexOf("@") - 2))}@${authEmail.split("@")[1] || "domain.com"}`
    : "a***ng@domain.com.";

  return (
    <AuthPageLayout>
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
        {/* Top Mail Check Icon */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-sky-700 shadow-2xs">
            <div className="relative">
              <Mail className="h-5 w-5 text-slate-700" />
              <Check className="h-3 w-3 text-sky-600 stroke-[3] absolute -bottom-1 -right-1" />
            </div>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Verify your email
          </h1>
          <div className="text-xs text-slate-600 leading-relaxed font-sans space-y-0.5">
            <div>We sent a 6-digit verification code to</div>
            <div className="font-bold text-slate-900 font-mono">{maskedEmail}</div>
            <div>Enter the code below to confirm your account.</div>
            <Link
              href="/signup"
              className="inline-block text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] cursor-pointer pt-0.5"
            >
              Change email
            </Link>
          </div>
        </div>

        {/* 6-box OTP input */}
        <div className="flex justify-center gap-2.5 my-3">
          {otp.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                otpInputRefs.current[idx] = el;
              }}
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(idx, e.target.value)}
              onKeyDown={(e) => handleOtpKeyDown(idx, e)}
              placeholder="-"
              className={clsx(
                "w-12 h-14 rounded-lg bg-[#f1f5f9]/80 border text-center font-mono text-xl font-bold text-slate-900 focus:bg-white focus:outline-none transition-all shadow-2xs",
                digit ? "border-slate-300" : "border-slate-200 text-slate-400 focus:ring-1 focus:ring-slate-900"
              )}
            />
          ))}
        </div>

        {error && (
          <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono text-center">
            {error}
          </div>
        )}

        {/* Verify Code Button */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="w-full py-3 px-4 rounded-md bg-black hover:bg-slate-800 active:bg-slate-900 text-white font-sans text-xs font-semibold tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span>{loading ? "Verifying..." : "Verify Code"}</span>
        </button>

        {/* Timer & Resend */}
        <div className="text-center text-xs text-slate-600 font-sans">
          Didn&apos;t receive code?{" "}
          <span className="font-semibold text-[#0284c7]">
            Code expires in {formatTimer(timerSeconds)}
          </span>
        </div>

        {/* Back to sign in */}
        <div className="pt-2 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </AuthPageLayout>
  );
}
