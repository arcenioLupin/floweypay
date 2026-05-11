"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const ALL_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "SEEN_IN_MEMPOOL",
  "CONFIRMING",
  "CONFIRMED",
  "EXPIRED",
  "FAILED",
] as const;

export default function PaymentFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeStatuses = searchParams.getAll("status");
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const buildParams = useCallback(
    (overrides: Record<string, string | string[]>) => {
      const p = new URLSearchParams();
      const merged: Record<string, string | string[]> = {
        status: activeStatuses,
        from,
        to,
        ...overrides,
      };
      for (const [key, val] of Object.entries(merged)) {
        if (Array.isArray(val)) {
          val.forEach((v) => v && p.append(key, v));
        } else if (val) {
          p.set(key, val);
        }
      }
      return p.toString();
    },
    [activeStatuses, from, to]
  );

  function toggleStatus(s: string) {
    const next = activeStatuses.includes(s)
      ? activeStatuses.filter((x) => x !== s)
      : [...activeStatuses, s];
    router.push(`?${buildParams({ status: next, cursor: "" })}`);
  }

  function onDateChange(field: "from" | "to", value: string) {
    router.push(`?${buildParams({ [field]: value, cursor: "" })}`);
  }

  function onClear() {
    router.push("?");
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end", marginBottom: "16px" }}>
      <fieldset style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 12px" }}>
        <legend style={{ fontSize: 12, color: "#6b7280", padding: "0 4px" }}>Status</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ALL_STATUSES.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={activeStatuses.includes(s)}
                onChange={() => toggleStatus(s)}
              />
              <StatusBadge status={s} />
            </label>
          ))}
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "#374151" }}>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => onDateChange("from", e.target.value)}
            style={{ marginLeft: 4, fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px" }}
          />
        </label>
        <label style={{ fontSize: 13, color: "#374151" }}>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => onDateChange("to", e.target.value)}
            style={{ marginLeft: 4, fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px" }}
          />
        </label>
        {(activeStatuses.length > 0 || from || to) && (
          <button
            type="button"
            onClick={onClear}
            style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    PENDING:          { bg: "#f3f4f6", color: "#374151" },
    AWAITING_PAYMENT: { bg: "#eff6ff", color: "#1d4ed8" },
    SEEN_IN_MEMPOOL:  { bg: "#fefce8", color: "#92400e" },
    CONFIRMING:       { bg: "#fff7ed", color: "#c2410c" },
    CONFIRMED:        { bg: "#f0fdf4", color: "#15803d" },
    EXPIRED:          { bg: "#f9fafb", color: "#9ca3af" },
    FAILED:           { bg: "#fef2f2", color: "#dc2626" },
  };
  const c = colors[status] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      borderRadius: 4,
      padding: "1px 6px",
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
