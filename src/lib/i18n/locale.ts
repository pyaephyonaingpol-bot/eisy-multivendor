import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type AppLocale,
  isAppLocale,
  resolveLocale,
} from "@/lib/i18n/config";

export function parseLocaleHeader(
  acceptLanguage: string | null | undefined,
): AppLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean) as string[];

  for (const candidate of candidates) {
    const base = candidate.slice(0, 2);
    if (isAppLocale(base)) return base;
    if (candidate.startsWith("zh")) return "zh";
    if (candidate.startsWith("my") || candidate.startsWith("bur")) return "my";
  }
  return DEFAULT_LOCALE;
}

export async function getRequestLocale(): Promise<AppLocale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isAppLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const fromHeader = parseLocaleHeader(headerStore.get("accept-language"));
  return resolveLocale(fromHeader);
}
