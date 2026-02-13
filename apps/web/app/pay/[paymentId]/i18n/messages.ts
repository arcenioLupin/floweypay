import es from "./locales/es.json";
import en from "./locales/en.json";

export const MESSAGES = { es, en } as const;

export type Lang = keyof typeof MESSAGES;

// Nota: al ser JSON, TS suele tiparlo como Record<string,string>.
// Igual sirve perfecto; autocomplete de keys puede ser limitado.
export type MessageKey = string;

export function translate(lang: Lang, key: MessageKey): string {
  const dict = MESSAGES[lang] as Record<string, string>;
  const fallback = MESSAGES.es as Record<string, string>;
  return dict[key] ?? fallback[key] ?? key;
}
