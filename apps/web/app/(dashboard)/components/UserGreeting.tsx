"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/app/lib/i18n/useTranslations";

type MeResponse =
  | {
      ok: true;
      user: {
        email: string;
        handle: string | null;
        display_name: string | null;
      };
    }
  | {
      ok: false;
      message?: string;
    };

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

export function UserGreeting() {
  const { t } = useTranslations();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = (await res.json()) as MeResponse;

        if (!mounted || !data.ok) return;

        // Fallback order: display_name → handle → email
        const displayName =
          data.user.display_name || data.user.handle || data.user.email;

        setName(getFirstName(displayName));
      } catch (err) {
        console.error("[UserGreeting] Failed to load user:", err);
      }
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  if (!name) return null;

  return (
    <span
      title={name}
      style={{
        fontSize: 13,
        color: "#374151",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 140,
        display: "inline-block",
        verticalAlign: "middle",
      }}
    >
      {t("greeting.hi", { name })}
    </span>
  );
}