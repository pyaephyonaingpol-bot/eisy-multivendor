export const LOCALES = [
  "en",
  "my",
  "ar",
  "zh",
  "ru",
  "fr",
  "de",
  "es",
  "nl",
] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_COOKIE = "eisy_locale";

export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(["ar"]);

export const LOCALE_LABELS: Record<
  AppLocale,
  { native: string; english: string }
> = {
  en: { native: "English", english: "English" },
  my: { native: "မြန်မာ", english: "Burmese" },
  ar: { native: "العربية", english: "Arabic" },
  zh: { native: "中文", english: "Chinese" },
  ru: { native: "Русский", english: "Russian" },
  fr: { native: "Français", english: "French" },
  de: { native: "Deutsch", english: "German" },
  es: { native: "Español", english: "Spanish" },
  nl: { native: "Nederlands", english: "Dutch" },
};

export function isAppLocale(
  value: string | null | undefined,
): value is AppLocale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function isRtlLocale(locale: AppLocale): boolean {
  return RTL_LOCALES.has(locale);
}

export function resolveLocale(
  value: string | null | undefined,
): AppLocale {
  if (isAppLocale(value)) return value;
  return DEFAULT_LOCALE;
}
