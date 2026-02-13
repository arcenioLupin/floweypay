"use client";

import * as React from "react";
import { translate, type Lang, type MessageKey } from "./messages";

const STORAGE_KEY = "floweypay_lang";

export function useI18n(defaultLang: Lang = "es") {
  const [lang, setLang] = React.useState<Lang>(defaultLang);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "es" || stored === "en") setLang(stored);
    } catch {}
  }, []);

  const setLanguage = React.useCallback((next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = React.useCallback((key: MessageKey) => translate(lang, key), [lang]);

  return { lang, setLanguage, t };
}
