/**
 * Login.tsx — Famoir phone number login page.
 *
 * Flow:
 *   1. User enters phone number (digits only, +1 US default) → receives SMS code
 *   2. User enters 6-digit code → auto-submits on last digit → completes sign-in
 *   3. Redirects to /dashboard
 *
 * In DEV_MODE this page auto-redirects because AuthContext already has a mock user.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { BookOpen, Phone, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { setupRecaptcha, sendSmsCode } from "@/lib/firebase";
import type { ConfirmationResult } from "firebase/auth";

/** Strip everything except digits from a string. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Format 10 US digits as (555) 123-4567. Partial input is fine. */
function formatUSPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  // Store raw digits only (max 10 for US numbers)
  const [phoneDigits, setPhoneDigits] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const otpInputRef = useRef<HTMLInputElement>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  // --- Step 2 helper: verify OTP (called by auto-submit or button) ---
  const verifyCode = useCallback(async (code: string) => {
    if (!confirmResult || code.length < 6 || verifying) return;
    setError("");
    setVerifying(true);

    try {
      await confirmResult.confirm(code);
      // Auth state listener in AuthContext will pick up the new user and redirect
    } catch (err: unknown) {
      console.error("OTP verify error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid-verification-code")) {
        setError("Invalid code. Please check and try again.");
      } else if (msg.includes("code-expired")) {
        setError("Code expired. Please request a new one.");
        setConfirmResult(null);
        setOtp("");
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  }, [confirmResult, verifying]);

  // --- Step 1: Send SMS code ---
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDigits.length < 10) return;
    setError("");
    setSending(true);

    // Prepend +1 for US
    const fullNumber = `+1${phoneDigits}`;

    try {
      const verifier = setupRecaptcha("send-code-btn");
      const result = await sendSmsCode(fullNumber, verifier);
      setConfirmResult(result);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err: unknown) {
      console.error("sendSmsCode error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid-phone-number")) {
        setError("Invalid phone number. Please check and try again.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Failed to send verification code. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  // --- Phone input handler: digits only, max 10 ---
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = digitsOnly(e.target.value);
    setPhoneDigits(raw.slice(0, 10));
  };

  // --- OTP input handler: auto-submit on 6 digits ---
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = digitsOnly(e.target.value).slice(0, 6);
    setOtp(code);
    if (code.length === 6) {
      verifyCode(code);
    }
  };

  // Display phone as "+1 (555) 123-4567"
  const displayPhone = phoneDigits ? `+1 ${formatUSPhone(phoneDigits)}` : "";

  // Show spinner while checking auth state
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)",
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "hsl(var(--terracotta))" }}
          />
          <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5"
      style={{
        background:
          "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)",
      }}
    >
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 mb-8">
          <BookOpen className="w-7 h-7" style={{ color: "hsl(var(--terracotta))" }} />
          <span
            className="font-display font-bold text-2xl"
            style={{ color: "hsl(var(--deep-brown))" }}
          >
            Fam<span style={{ color: "hsl(var(--terracotta))" }}>oir</span>
          </span>
        </Link>

        {/* Card */}
        <div
          className="w-full rounded-3xl px-7 py-8 animate-fade-in-up"
          style={{
            background: "hsl(var(--warm-white))",
            border: "2px solid hsl(var(--border))",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {confirmResult ? (
            /* ---- OTP verification state ---- */
            <>
              <div className="text-center mb-6">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "hsl(var(--light-peach))" }}
                >
                  <ShieldCheck className="w-7 h-7" style={{ color: "hsl(var(--terracotta))" }} />
                </div>
                <h2
                  className="font-display font-bold text-xl mb-1"
                  style={{ color: "hsl(var(--deep-brown))" }}
                >
                  Enter verification code
                </h2>
                <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                  We sent a 6-digit code to{" "}
                  <strong style={{ color: "hsl(var(--deep-brown))" }}>{displayPhone}</strong>
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={handleOtpChange}
                  disabled={verifying}
                  className="w-full text-center text-2xl tracking-[0.5em] py-3.5 rounded-2xl font-body outline-none transition-all"
                  style={{
                    background: "hsl(var(--cream))",
                    border: "2px solid hsl(var(--border))",
                    color: "hsl(var(--deep-brown))",
                    letterSpacing: "0.5em",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "hsl(var(--terracotta))")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(var(--border))")}
                />

                {verifying && (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2
                      className="w-5 h-5 animate-spin"
                      style={{ color: "hsl(var(--terracotta))" }}
                    />
                    <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                      Verifying...
                    </p>
                  </div>
                )}

                {error && (
                  <p className="font-body text-sm text-center" style={{ color: "#c0392b" }}>
                    {error}
                  </p>
                )}
              </div>

              <button
                onClick={() => { setConfirmResult(null); setOtp(""); setError(""); }}
                className="font-body text-sm underline underline-offset-2 mt-4 w-full text-center"
                style={{ color: "hsl(var(--terracotta))" }}
              >
                Use a different number
              </button>
            </>
          ) : (
            /* ---- Phone number input state ---- */
            <>
              <div className="text-center mb-6">
                <h2
                  className="font-display font-bold text-xl mb-1"
                  style={{ color: "hsl(var(--deep-brown))" }}
                >
                  Welcome to Famoir
                </h2>
                <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                  Sign in to preserve your family stories
                </p>
              </div>

              <form onSubmit={handleSendCode} className="flex flex-col gap-4">
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 font-body text-base select-none"
                    style={{ color: "hsl(var(--deep-brown))" }}
                  >
                    +1
                  </span>
                  <Phone
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: "hsl(var(--warm-gray))" }}
                  />
                  <input
                    type="tel"
                    required
                    placeholder="(555) 123-4567"
                    value={formatUSPhone(phoneDigits)}
                    onChange={handlePhoneChange}
                    className="w-full pl-12 pr-12 py-3.5 rounded-2xl font-body text-base outline-none transition-all"
                    style={{
                      background: "hsl(var(--cream))",
                      border: "2px solid hsl(var(--border))",
                      color: "hsl(var(--deep-brown))",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "hsl(var(--terracotta))")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(var(--border))")}
                    autoComplete="tel-national"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="font-body text-sm text-center" style={{ color: "#c0392b" }}>
                    {error}
                  </p>
                )}

                <button
                  id="send-code-btn"
                  type="submit"
                  disabled={sending || phoneDigits.length < 10}
                  className="btn-primary w-full justify-center gap-2"
                  style={{ height: 52, borderRadius: "16px", fontSize: "1.05rem" }}
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send verification code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p
                className="font-body text-xs text-center mt-5"
                style={{ color: "hsl(var(--warm-gray))" }}
              >
                We'll text you a code to verify your number.
              </p>
            </>
          )}
        </div>

        {/* Footer link */}
        <Link
          to="/"
          className="mt-6 font-body text-sm underline underline-offset-2"
          style={{ color: "hsl(var(--warm-gray))" }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
