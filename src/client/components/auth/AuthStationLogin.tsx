"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import clsx from "clsx";
import {
  Mail,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Shield,
} from "lucide-react";
import { AssuranceApiClient } from "@/client/lib/api-client";

export interface OperatorProfile {
  name: string;
  role: "analyst" | "admin" | null;
}

interface AuthStationLoginProps {
  onAuthenticated: (operator: OperatorProfile) => void;
}

type AuthView =
  | "signin"
  | "verify-email"
  | "signup"
  | "forgot-password"
  | "reset-password";

export const AuthStationLogin: React.FC<AuthStationLoginProps> = ({
  onAuthenticated,
}) => {
  const [view, setView] = useState<AuthView>("signin");

  // Sign In state
  const [email, setEmail] = useState("marcus.vance@us-defense.ai");
  const [password, setPassword] = useState("•••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  // Sign Up state
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Verify Email OTP state
  const [otp, setOtp] = useState<string[]>(["8", "4", "1", "", "", ""]);
  const [timerSeconds, setTimerSeconds] = useState(263); // 04:23
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot / Reset Password state
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // General loading / error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer for verify email
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (view === "verify-email" && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [view, timerSeconds]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const deriveDisplayName = (userEmail: string, customName?: string) => {
    if (customName && customName.trim()) return customName.trim();
    if (!userEmail) return "Dr. A. Turing";
    const prefix = userEmail.split("@")[0] || "Operator";
    return prefix
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const completeAuthentication = async (accountEmail: string, customName?: string) => {
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

      onAuthenticated({
        name: deriveDisplayName(accountEmail, customName),
        role,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  // Sign In Handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    await completeAuthentication(email);
  };

  // Sign Up Handler
  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workEmail.trim() || !fullName.trim()) {
      setError("Please complete all required fields.");
      return;
    }
    if (!agreeTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setError(null);
    setView("verify-email");
  };

  // OTP Change Handler
  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, "");
    const updated = [...otp];
    if (cleaned.length > 1) {
      // Paste handling
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

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }
    await completeAuthentication(workEmail || email, fullName);
  };

  // Forgot Password Handler
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setError(null);
    setView("reset-password");
  };

  // Reset Password Handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    await completeAuthentication(resetEmail || email);
  };

  // Password requirements check
  const reqLength = newPassword.length >= 8;
  const reqUpperLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const reqNumSpecial = /[\d!@#$%^&*(),.?":{}|<>]/.test(newPassword);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between antialiased font-sans relative">
      {/* Top Header Clearance Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200/80 bg-white/70 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 tracking-wider">
            ZERO-TRUST INGESTION // PRE-TRAINING DATA FIREWALL
          </span>
        </div>
        <div className="text-xs font-mono text-slate-500 font-medium">
          Assurance Platform
        </div>
      </header>

      {/* Main Centered Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 my-4">
        {/* ========================================================================= */}
        {/* VIEW 1: SIGN IN (Matches Image 1)                                         */}
        {/* ========================================================================= */}
        {view === "signin" && (
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
            {/* Top Brand Logo */}
            <div className="flex justify-center pb-1">
              <Image
                src="/logo.png"
                alt="Sentinel Logo"
                width={220}
                height={50}
                priority
                className="h-12 w-auto object-contain max-w-[220px]"
              />
            </div>

            {/* Title & Subtitle */}
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Sign in to Sentinel
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
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setView("forgot-password");
                    }}
                    className="text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] cursor-pointer"
                  >
                    Forgot password?
                  </button>
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
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("signup");
                }}
                className="font-bold text-slate-900 hover:underline cursor-pointer"
              >
                Request access
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: VERIFY YOUR EMAIL (Matches Image 2)                               */}
        {/* ========================================================================= */}
        {view === "verify-email" && (
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
            {/* Top Brand Eye Icon */}
            <div className="flex justify-center pb-1">
              <Image
                src="/logo_withoutlabel.png"
                alt="Sentinel Verify"
                width={48}
                height={48}
                priority
                className="h-12 w-auto object-contain"
              />
            </div>

            {/* Title & Subtitle */}
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Verify your email
              </h1>
              <div className="text-xs text-slate-600 leading-relaxed font-sans space-y-0.5">
                <div>We sent a 6-digit verification code to</div>
                <div className="font-bold text-slate-900 font-mono">
                  {workEmail ? `${workEmail.substring(0, 1)}***@${workEmail.split("@")[1] || "domain.com"}` : "a***ng@domain.com."}
                </div>
                <div>Enter the code below to confirm your account.</div>
                <button
                  type="button"
                  onClick={() => setView("signup")}
                  className="text-xs font-semibold text-[#0284c7] hover:text-[#0369a1] cursor-pointer pt-0.5"
                >
                  Change email
                </button>
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
              onClick={handleVerifyOtp}
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
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("signin");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Back to sign in</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: CREATE YOUR ACCOUNT (Matches Image 3)                             */}
        {/* ========================================================================= */}
        {view === "signup" && (
          <div className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-5">
            {/* Top Brand Logo */}
            <div className="flex justify-center pb-1">
              <Image
                src="/logo.png"
                alt="Sentinel Logo"
                width={210}
                height={48}
                priority
                className="h-11 w-auto object-contain max-w-[210px]"
              />
            </div>

            {/* Title & Subtitle */}
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Create your account
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Join Sentinel to inspect and evaluate vision models
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
                    type={showSignupPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="•••••••••••••"
                    className="w-full bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus:bg-white border border-slate-200 rounded-md pl-3.5 pr-10 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSignupPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password Strength */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-slate-500 font-mono text-[11px]">
                  Password Strength
                </span>
                <span className="font-semibold text-[#0284c7] font-mono text-[11px]">
                  {signupPassword.length >= 8 ? "Strong" : "Pending"}
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
                  <button
                    type="button"
                    onClick={() => alert("Terms of Service for Defense CV Integrity Station")}
                    className="text-[#0284c7] hover:underline font-medium"
                  >
                    Terms of Service
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={() => alert("Privacy Policy for Defense CV Integrity Station")}
                    className="text-[#0284c7] hover:underline font-medium"
                  >
                    Privacy Policy
                  </button>
                  .
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
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("signin");
                }}
                className="font-bold text-slate-900 hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: RESET YOUR PASSWORD (Matches Image 4)                             */}
        {/* ========================================================================= */}
        {view === "forgot-password" && (
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
            {/* Top Brand Eye Icon */}
            <div className="flex justify-center pb-1">
              <Image
                src="/logo_withoutlabel.png"
                alt="Sentinel Security"
                width={48}
                height={48}
                className="h-12 w-auto object-contain"
              />
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
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 font-sans">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
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
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("signin");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 5: SET NEW PASSWORD (Matches Image 5)                                */}
        {/* ========================================================================= */}
        {view === "reset-password" && (
          <div className="w-full max-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-8 space-y-6">
            {/* Top Brand Eye Icon */}
            <div className="flex justify-center pb-1">
              <Image
                src="/logo_withoutlabel.png"
                alt="Sentinel Security"
                width={48}
                height={48}
                className="h-12 w-auto object-contain"
              />
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
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                    {showConfirmNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
                      className={clsx(
                        "h-3.5 w-3.5",
                        reqLength ? "text-sky-600" : "text-slate-300"
                      )}
                    />
                    <span className={clsx(reqLength && "text-slate-900 font-medium")}>
                      At least 8 characters long
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={clsx(
                        "h-3.5 w-3.5",
                        reqUpperLower ? "text-sky-600" : "text-slate-300"
                      )}
                    />
                    <span className={clsx(reqUpperLower && "text-slate-900 font-medium")}>
                      Must include uppercase and lowercase letters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={clsx(
                        "h-3.5 w-3.5",
                        reqNumSpecial ? "text-sky-600" : "text-slate-300"
                      )}
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
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView("signin");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </div>
        )}
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
