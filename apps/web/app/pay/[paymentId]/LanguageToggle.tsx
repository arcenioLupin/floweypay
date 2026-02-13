"use client";

import React from "react";
import styles from "./BtcPaymentLink.module.css";
import type { Lang } from "./i18n/messages";

type Props = {
  lang: Lang;
  onChange: (lang: Lang) => void;
};

export default function LanguageToggle({ lang, onChange }: Props) {
  return (
    <div className={styles.langToggle} role="group" aria-label="Language toggle">
      <button
        type="button"
        className={`${styles.langBtn} ${lang === "es" ? styles.langBtnActive : ""}`}
        onClick={() => onChange("es")}
      >
        ES
      </button>
      <button
        type="button"
        className={`${styles.langBtn} ${lang === "en" ? styles.langBtnActive : ""}`}
        onClick={() => onChange("en")}
      >
        EN
      </button>
    </div>
  );
}
