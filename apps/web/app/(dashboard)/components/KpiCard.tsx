type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
};

export function KpiCard({ label, value, sub, accent }: Props) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        borderLeft: accent ? "3px solid #2563eb" : undefined,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 30,
          fontWeight: 700,
          color: accent ? "#2563eb" : "#111827",
          lineHeight: 1,
          letterSpacing: "-0.5px",
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 11,
            color: "#9ca3af",
            lineHeight: 1.4,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
