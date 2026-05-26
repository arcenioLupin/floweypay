"use client";

import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type FormValues = {
  title: string;
  message: string;
  amount: string;
  currency: "USD" | "PEN";
};

type SuccessData = {
  publicUrl: string;
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 580,
    margin: "0 auto",
    padding: "40px 24px",
    fontFamily: "sans-serif",
  } satisfies React.CSSProperties,

  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: "28px 28px",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
  } satisfies React.CSSProperties,

  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 18,
  } satisfies React.CSSProperties,

  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  } satisfies React.CSSProperties,

  input: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  } satisfies React.CSSProperties,

  primaryBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "12px 20px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
  } satisfies React.CSSProperties,

  secondaryBtn: {
    background: "#f3f4f6",
    color: "#111827",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  } satisfies React.CSSProperties,
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewPaymentLinkPage() {
  const [form, setForm] = useState<FormValues>({
    title: "",
    message: "",
    amount: "",
    currency: "USD",
  });
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok">("idle");

  function setField(field: keyof FormValues) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError(null);

    const amountFloat = parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
      setApiError("Please enter a valid positive amount.");
      return;
    }
    const amountCents = Math.round(amountFloat * 100);
    if (amountCents < 1) {
      setApiError("Amount is too small.");
      return;
    }

    setSubmitting(true);

    try {
      // Step 1 — Create product
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          // message is required (min 1) — fall back to title if user left it blank
          message: form.message.trim() || form.title.trim(),
          amount_cents: amountCents,
          currency: form.currency,
        }),
      });

      type ProductResp =
        | { success: true; data: { id: string } }
        | { success: false; message?: string };

      const productJson = (await productRes
        .json()
        .catch(() => null)) as ProductResp | null;

      if (!productRes.ok || !productJson?.success) {
        const msg =
          (!productJson?.success && productJson?.message) ||
          "Could not create product.";
        throw new Error(msg);
      }

      // Step 2 — Create payment link
      const linkRes = await fetch("/api/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productJson.data.id }),
      });

      type LinkResp =
        | { success: true; data: { public_url: string; token: string } }
        | { success: false; message?: string };

      const linkJson = (await linkRes
        .json()
        .catch(() => null)) as LinkResp | null;

      if (!linkRes.ok || !linkJson?.success) {
        const msg =
          (!linkJson?.success && linkJson?.message) ||
          "Could not create payment link.";
        throw new Error(msg);
      }

      setSuccess({ publicUrl: linkJson.data.public_url });
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Unexpected error. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.publicUrl);
      setCopyState("ok");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // Clipboard unavailable — silent no-op
    }
  }

  function handleReset() {
    setForm({ title: "", message: "", amount: "", currency: "USD" });
    setApiError(null);
    setSuccess(null);
    setCopyState("idle");
  }

  const canSubmit = !submitting && form.title.trim().length > 0 && form.amount.length > 0;

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div style={S.page}>
        <Link
          href="/"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← Dashboard
        </Link>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#111827",
            marginTop: 16,
            marginBottom: 4,
          }}
        >
          Payment link ready
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#6b7280",
            marginTop: 0,
            marginBottom: 20,
          }}
        >
          Share this link with your payer. No login required on their end.
        </p>

        <div style={S.card}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.4px",
              color: "#6b7280",
              textTransform: "uppercase",
              margin: "0 0 8px",
            }}
          >
            Public payment link
          </p>

          {/* URL row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 8,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "11px 14px",
                fontSize: 13,
                fontFamily: "monospace",
                color: "#111827",
                background: "#f9fafb",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
              title={success.publicUrl}
            >
              {success.publicUrl}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                ...S.secondaryBtn,
                width: "auto",
                whiteSpace: "nowrap",
                background: copyState === "ok" ? "#dcfce7" : "#f3f4f6",
                borderColor: copyState === "ok" ? "#86efac" : "#d1d5db",
                color: copyState === "ok" ? "#166534" : "#111827",
                transition: "background 150ms ease, border-color 150ms ease",
              }}
            >
              {copyState === "ok" ? "Copied ✓" : "Copy"}
            </button>
          </div>

          {/* Open in new tab */}
          <a
            href={success.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...S.primaryBtn,
              display: "block",
              textDecoration: "none",
              marginBottom: 10,
            }}
          >
            Open payment page ↗
          </a>

          {/* Create another */}
          <button
            type="button"
            onClick={handleReset}
            style={S.secondaryBtn}
          >
            Create another link
          </button>
        </div>
      </div>
    );
  }

  // ── Form screen ────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <Link
        href="/"
        style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
      >
        ← Dashboard
      </Link>

      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#111827",
          marginTop: 16,
          marginBottom: 4,
        }}
      >
        New payment link
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "#6b7280",
          marginTop: 0,
          marginBottom: 20,
        }}
      >
        Creates a product and generates a shareable BTC payment link.
      </p>

      <div style={S.card}>
        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div style={S.fieldGroup}>
            <label htmlFor="pl-title" style={S.label}>
              Product title{" "}
              <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="pl-title"
              type="text"
              required
              maxLength={120}
              placeholder="e.g. Consulting session"
              value={form.title}
              onChange={setField("title")}
              style={S.input}
              autoFocus
            />
          </div>

          {/* Description */}
          <div style={S.fieldGroup}>
            <label htmlFor="pl-message" style={S.label}>
              Description{" "}
              <span
                style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}
              >
                (optional)
              </span>
            </label>
            <textarea
              id="pl-message"
              maxLength={500}
              rows={3}
              placeholder="Additional details shown to the payer"
              value={form.message}
              onChange={setField("message")}
              style={{ ...S.input, resize: "vertical", height: "auto" }}
            />
          </div>

          {/* Amount + Currency */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 96px",
              gap: 10,
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="pl-amount" style={S.label}>
                Amount <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="pl-amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={setField("amount")}
                style={S.input}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="pl-currency" style={S.label}>
                Currency
              </label>
              <select
                id="pl-currency"
                value={form.currency}
                onChange={setField("currency")}
                style={{ ...S.input, width: "auto" }}
              >
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </div>
          </div>

          {/* API error */}
          {apiError && (
            <div
              style={{
                border: "1px solid #fca5a5",
                borderRadius: 8,
                background: "#fef2f2",
                padding: "10px 12px",
                fontSize: 13,
                color: "#b91c1c",
                marginBottom: 16,
              }}
            >
              {apiError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...S.primaryBtn,
              opacity: canSubmit ? 1 : 0.55,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Creating…" : "Create payment link"}
          </button>
        </form>
      </div>
    </div>
  );
}
