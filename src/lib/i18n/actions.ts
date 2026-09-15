"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  LOCALE_COOKIE,
  type AppLocale,
  isAppLocale,
} from "@/lib/i18n/config";

export async function setLocaleAction(locale: string): Promise<{ ok: boolean }> {
  if (!isAppLocale(locale)) {
    return { ok: false };
  }
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale as AppLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
