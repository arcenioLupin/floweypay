"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setLoading(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        fontSize: 13,
        color: "#9ca3af",
        background: "none",
        border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        padding: 0,
      }}
    >
      {loading ? "…" : "Log out"}
    </button>
  );
}
