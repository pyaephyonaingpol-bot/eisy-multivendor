"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/lib/i18n/actions";
import {
  DEFAULT_LOCALE,
  type AppLocale,
  isRtlLocale,
} from "@/lib/i18n/config";
import {
  getDictionary,
  translate,
  type Dictionary,
} from "@/lib/i18n/get-dictionary";

type I18nContextValue = {
  locale: AppLocale;
  dictionary: Dictionary;
  dir: "ltr" | "rtl";
  t: (path: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: AppLocale) => void;
  pending: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({
  locale: initialLocale,
  children,
}: {
  locale: AppLocale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [clientLocale, setClientLocale] = useState<AppLocale | null>(null);
  const [pending, startTransition] = useTransition();
  const locale = clientLocale ?? initialLocale ?? DEFAULT_LOCALE;
  const dictionary = useMemo(() => getDictionary(locale), [locale]);
  const dir: "ltr" | "rtl" = isRtlLocale(locale) ? "rtl" : "ltr";

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) =>
      translate(dictionary, path, vars),
    [dictionary],
  );

  const setLocale = useCallback(
    (next: AppLocale) => {
      setClientLocale(next);
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
        document.documentElement.dir = isRtlLocale(next) ? "rtl" : "ltr";
      }
      startTransition(() => {
        void setLocaleAction(next).then(() => {
          router.refresh();
        });
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({
      locale,
      dictionary,
      dir,
      t,
      setLocale,
      pending,
    }),
    [locale, dictionary, dir, t, setLocale, pending],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}
