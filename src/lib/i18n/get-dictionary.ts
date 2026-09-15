import type { AppLocale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/config";
import ar from "@/lib/i18n/dictionaries/ar.json";
import de from "@/lib/i18n/dictionaries/de.json";
import en from "@/lib/i18n/dictionaries/en.json";
import es from "@/lib/i18n/dictionaries/es.json";
import fr from "@/lib/i18n/dictionaries/fr.json";
import my from "@/lib/i18n/dictionaries/my.json";
import nl from "@/lib/i18n/dictionaries/nl.json";
import ru from "@/lib/i18n/dictionaries/ru.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

export type Dictionary = typeof en;

const dictionaries: Record<AppLocale, Dictionary> = {
  en,
  my: my as Dictionary,
  ar: ar as Dictionary,
  zh: zh as Dictionary,
  ru: ru as Dictionary,
  fr: fr as Dictionary,
  de: de as Dictionary,
  es: es as Dictionary,
  nl: nl as Dictionary,
};

export function getDictionary(locale: string | null | undefined): Dictionary {
  const resolved: AppLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return dictionaries[resolved] ?? dictionaries[DEFAULT_LOCALE];
}

export function translate(
  dictionary: Dictionary,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const parts = path.split(".");
  let current: unknown = dictionary;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return path;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") return path;
  if (!vars) return current;
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    current,
  );
}
