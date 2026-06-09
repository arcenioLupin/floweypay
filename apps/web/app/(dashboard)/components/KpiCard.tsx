type AccentColor = "green" | "blue" | "orange";

const ACCENT: Record<AccentColor, { border: string; text: string }> = {
  green:  { border: "#16a34a", text: "#15803d" },
  blue:   { border: "#2563eb", text: "#2563eb" },
  orange: { border: "#f59e0b", text: "#d97706" },
};

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  accentColor?: AccentColor;
  icon?: React.ReactNode;
};

export function KpiCard({ label, value, sub, accent, accentColor, icon }: Props) {
  const color = accentColor
    ? ACCENT[accentColor]
    : accent
    ? ACCENT.blue
    : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        borderLeft: color ? `3px solid ${color.border}` : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
        {icon && (
          <span style={{ color: color?.border ?? "#9ca3af", opacity: 0.75, lineHeight: 0 }}>
            {icon}
          </span>
        )}
      </div>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 30,
          fontWeight: 700,
          color: color ? color.text : "#111827",
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
