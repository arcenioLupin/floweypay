"use client";

import { useTranslations } from "./useTranslations";
import type { MessageKey } from "./messages/en";

/**
 * Renders a translated string. Safe to drop inside server components so their
 * text reacts to the language toggle without a full page reload.
 */
export function T({
  k,
  params,
}: {
  k: MessageKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useTranslations();
  return <>{t(k, params)}</>;
}
