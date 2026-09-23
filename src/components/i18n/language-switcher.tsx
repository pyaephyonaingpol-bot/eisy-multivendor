"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/language-provider";

type Props = {
  compact?: boolean;
  className?: string;
};

/**
 * Locale select — deferred until mount so browser extensions / autofill cannot
 * desync SSR HTML from the controlled `value={locale}` select.
 */
export function LanguageSwitcher({ compact = false, className = "" }: Props) {
  const { locale, setLocale, pending, t } = useI18n();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const labelClass = compact ? "sr-only" : "hidden sm:inline";
  const selectClassName =
    "min-h-9 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:border-zinc-300 disabled:opacity-60";

  // Pre-mount shell: same layout, no controlled locale binding.
  if (!isMounted) {
    return (
      <label
        className={`inline-flex items-center gap-2 text-xs text-zinc-600 ${className}`}
      >
        <span className={labelClass}>Language</span>
        <select
          aria-label="Language"
          disabled
          defaultValue={DEFAULT_LOCALE}
          className={selectClassName}
          suppressHydrationWarning
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code].native}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label
      className={`inline-flex items-center gap-2 text-xs text-zinc-600 ${className}`}
    >
      <span className={labelClass}>{t("language.label")}</span>
      <select
        aria-label={t("language.switchTo")}
        value={locale}
        disabled={pending}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        className={selectClassName}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code].native}
          </option>
        ))}
      </select>
    </label>
  );
}
