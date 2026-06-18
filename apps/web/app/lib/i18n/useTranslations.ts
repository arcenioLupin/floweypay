"use client";

import * as React from "react";
import { en, type MessageKey } from "./messages/en";
import { es } from "./messages/es";

export type Lang = "en" | "es";

const DICTIONARIES = { en, es } as const;

/** Shared with the public payment page so the choice carries across the app. */
const STORAGE_KEY = "floweypay_lang";

/** Simple `{token}` interpolation for translation strings. */
function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{${key}}`
  );
}

export type TranslateFn = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  defaultLang = "en",
}: {
  children: React.ReactNode;
  defaultLang?: Lang;
}) {
  const [lang, setLangState] = React.useState<Lang>(defaultLang);

  // Hydrate persisted choice on the client (default stays English on SSR).
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "es") setLangState(stored);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable — in-memory only */
    }
  }, []);

  const t = React.useCallback<TranslateFn>(
    (key, params) => {
      const dict = DICTIONARIES[lang] as Record<string, string>;
      const fallback = DICTIONARIES.en as Record<string, string>;
      return interpolate(dict[key] ?? fallback[key] ?? key, params);
    },
    [lang]
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  );

  // Use createElement (no JSX) so this file can keep its `.ts` extension.
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useTranslations(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslations must be used within an <I18nProvider>");
  }
  return ctx;
}
