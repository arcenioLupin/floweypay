"use client";

import { useTranslations, type Lang } from "@/app/lib/i18n/useTranslations";

const OPTIONS: Lang[] = ["es", "en"];

export function LanguageSwitcher() {
  const { lang, setLang, t } = useTranslations();

  return (
    <div
      role="group"
      aria-label={t("aria.language")}
      style={{
        display: "inline-flex",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {OPTIONS.map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              border: "none",
              cursor: active ? "default" : "pointer",
              background: active ? "#2563eb" : "#fff",
              color: active ? "#fff" : "#6b7280",
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
