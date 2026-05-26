"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Payments", href: "/payments" },
  { label: "Payment Links", href: "/payment-links/new" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation — defer to avoid synchronous setState inside effect
  useEffect(() => {
    const id = setTimeout(() => setDrawerOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  function NavLinks({ compact = false }: { compact?: boolean }) {
    return (
      <>
        {NAV_ITEMS.map(({ label, href }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "block",
                padding: compact ? "10px 14px" : "8px 12px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "#2563eb" : "#374151",
                textDecoration: "none",
                background: active ? "#eff6ff" : "transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <div className="fp-shell">
      {/* ── Desktop sidebar (nav only, no actions) ───────── */}
      <aside className="fp-sidebar">
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #f3f4f6", marginBottom: 8 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "#2563eb",
                letterSpacing: "-0.3px",
                lineHeight: 1,
              }}
            >
              FloweyPay
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              BTC Payments
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <NavLinks />
        </nav>
      </aside>

      {/* ── Content column ───────────────────────────────── */}
      <div className="fp-body">
        {/* Topbar — actions + hamburger on mobile */}
        <header className="fp-topbar">
          {/* Left: hamburger (mobile only) + brand (mobile only) */}
          <div className="fp-topbar-left">
            <button
              type="button"
              className="fp-hamburger"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <Link href="/" className="fp-mobile-brand">
              FloweyPay
            </Link>
          </div>

          {/* Right: actions (always visible) */}
          <div className="fp-topbar-actions">
            <Link
              href="/payment-links/new"
              style={{
                padding: "6px 14px",
                background: "#2563eb",
                color: "#fff",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              + New Link
            </Link>
            <LogoutButton />
          </div>
        </header>

        {/* Main content */}
        <main className="fp-main">{children}</main>
      </div>

      {/* ── Mobile drawer backdrop ────────────────────────── */}
      {drawerOpen && (
        <div
          className="fp-backdrop"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Mobile drawer ─────────────────────────────────── */}
      <div
        className={`fp-drawer ${drawerOpen ? "fp-drawer--open" : "fp-drawer--closed"}`}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            <span
              style={{ fontWeight: 800, fontSize: 16, color: "#2563eb" }}
            >
              FloweyPay
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              color: "#374151",
            }}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Drawer nav */}
        <nav
          style={{
            flex: 1,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <NavLinks compact />
        </nav>

        {/* Drawer bottom: actions */}
        <div
          style={{
            padding: "12px 16px 16px",
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <Link
            href="/payment-links/new"
            style={{
              display: "block",
              padding: "9px 14px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            + New Link
          </Link>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
