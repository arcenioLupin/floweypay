"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Step = "email" | "code";

// ─── Reused style tokens ──────────────────────────────────────────────────────
const input: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "10px 0",
  fontSize: 14,
  fontWeight: 600,
  background: disabled ? "#93c5fd" : "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: disabled ? "not-allowed" : "pointer",
  marginTop: 8,
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentOk, setResentOk] = useState(false);

  // ── Step 1: request OTP ────────────────────────────────────────────────────

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (res.status === 429) {
        const wait = data.retryAfterSeconds ?? 60;
        setError(`Too many attempts. Try again in ${wait}s.`);
        return;
      }

      if (!res.ok) {
        setError(data.message ?? "Could not send code. Try again.");
        return;
      }

      setStep("code");
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: trimmedCode }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (res.status === 429) {
        const wait = data.retryAfterSeconds ?? 60;
        setError(`Too many attempts. Try again in ${wait}s.`);
        return;
      }

      if (!res.ok) {
        setError(data.message ?? "Invalid or expired code.");
        return;
      }

      // Session cookie is set by the API — navigate to dashboard.
      router.push("/");
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  // ── Resend code (step 2 only) ──────────────────────────────────────────────
  // The backend silently no-ops if within the 60s cooldown window, so the UI
  // just shows a success flash regardless — safe because no new code is sent
  // until the cooldown passes.

  async function handleResendCode() {
    setLoading(true);
    setError(null);
    setCode("");
    setResentOk(false);

    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (res.status === 429) {
        const wait = data.retryAfterSeconds ?? 60;
        setError(`Too many attempts. Try again in ${wait}s.`);
        return;
      }

      if (!res.ok) {
        setError(data.message ?? "Could not resend code.");
        return;
      }

      setResentOk(true);
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        fontFamily: "sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "36px 32px",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", justifyContent: "center", margin: "0 0 28px" }}>
          <Image
            src="/branding/logo-floweypay.png"
            alt="FloweyPay"
            width={160}
            height={42}
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {step === "email" ? (
          /* ── Step 1 ── */
          <form onSubmit={handleRequestCode} noValidate>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#111827" }}>
              Sign in
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
              Enter your email to receive a one-time code.
            </p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                style={input}
              />
            </label>

            {error && <ErrorMsg msg={error} />}

            <button type="submit" disabled={loading || !email.trim()} style={primaryBtn(loading || !email.trim())}>
              {loading ? "Sending…" : "Send Code"}
            </button>
          </form>
        ) : (
          /* ── Step 2 ── */
          <form onSubmit={handleVerifyCode} noValidate>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#111827" }}>
              Check your email
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
              Code sent to{" "}
              <strong style={{ color: "#374151" }}>{email}</strong>.{" "}
              It expires in 10 minutes.
            </p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>
                One-time code
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                disabled={loading}
                required
                style={{ ...input, letterSpacing: "0.2em", fontFamily: "monospace", fontSize: 18 }}
              />
            </label>

            {error && <ErrorMsg msg={error} />}
            {resentOk && (
              <p style={{ fontSize: 12, color: "#15803d", margin: "0 0 8px" }}>
                ✓ New code sent — check your inbox.
              </p>
            )}

            <button type="submit" disabled={loading || code.trim().length < 4} style={primaryBtn(loading || code.trim().length < 4)}>
              {loading ? "Verifying…" : "Verify Code"}
            </button>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => { setStep("email"); setError(null); setCode(""); setResentOk(false); }}
                disabled={loading}
                style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", padding: 0 }}
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p
      style={{
        margin: "0 0 10px",
        fontSize: 12,
        color: "#dc2626",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 4,
        padding: "6px 10px",
      }}
    >
      {msg}
    </p>
  );
}
