"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Inline type to avoid importing from a server-only route file at runtime.
type DailyChartRow = {
  date: string;
  confirmedPaymentsCount: number;
  confirmedRevenueCents: number;
  confirmedBtcReceivedSats: string;
};

type Props = {
  days: DailyChartRow[];
};

function shortDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${month}/${day}`;
}

export function DailyChart({ days }: Props) {
  if (days.length === 0) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "48px 24px",
          textAlign: "center",
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        No confirmed payments in this period.
      </div>
    );
  }

  const data = days.map((d) => ({
    date: shortDate(d.date),
    payments: d.confirmedPaymentsCount,
    revenueCents: d.confirmedRevenueCents,
  }));

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "24px 24px 16px",
      }}
    >
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
        }}
      >
        Daily Confirmed Payments
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 0, right: 8, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "none",
            }}
            formatter={(value) => [value, "Payments"]}
            labelStyle={{ color: "#374151", marginBottom: 4 }}
          />
          <Bar
            dataKey="payments"
            fill="#2563eb"
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
