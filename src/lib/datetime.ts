/**
 * SSR-safe date formatting.
 *
 * Bare `toLocaleString()` / `toLocaleDateString()` use the runtime locale and
 * timezone, so Node (SSR) and the browser often produce different strings and
 * trigger React hydration mismatches. Always format with a fixed locale + UTC.
 */

const DISPLAY_LOCALE = "en-GB";
const DISPLAY_TIME_ZONE = "UTC";

function toValidDate(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Medium date + short time in UTC, e.g. "23 Sep 2026, 12:40". */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  const date = toValidDate(value);
  if (!date) return value == null ? "" : String(value);
  return date.toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Medium date in UTC, e.g. "23 Sept 2026". */
export function formatDate(
  value: string | number | Date | null | undefined,
): string {
  const date = toValidDate(value);
  if (!date) return value == null ? "" : String(value);
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
