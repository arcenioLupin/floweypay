"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function DashboardDateFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function onChange(field: "from" | "to", value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) {
      p.set(field, value);
    } else {
      p.delete(field);
    }
    router.push(`?${p.toString()}`);
  }

  function onClear() {
    router.push("?");
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <label style={{ fontSize: 13, color: "#374151" }}>
        From
        <input
          type="date"
          value={from}
          onChange={(e) => onChange("from", e.target.value)}
          style={{
            marginLeft: 6,
            fontSize: 13,
            border: "1px solid #d1d5db",
            borderRadius: 4,
            padding: "3px 8px",
          }}
        />
      </label>
      <label style={{ fontSize: 13, color: "#374151" }}>
        To
        <input
          type="date"
          value={to}
          onChange={(e) => onChange("to", e.target.value)}
          style={{
            marginLeft: 6,
            fontSize: 13,
            border: "1px solid #d1d5db",
            borderRadius: 4,
            padding: "3px 8px",
          }}
        />
      </label>
      {(from || to) && (
        <button
          type="button"
          onClick={onClear}
          style={{
            fontSize: 12,
            color: "#6b7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
