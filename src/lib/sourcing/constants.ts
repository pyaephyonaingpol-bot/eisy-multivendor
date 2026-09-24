import { ALL_COUNTRY_OPTIONS } from "@/lib/sourcing/countries";

/** Cookie storing the buyer destination country (ISO-ish, e.g. MM, TH, US). */
export const BUYER_COUNTRY_COOKIE = "eisy_buyer_country";

/** Cookie storing the resolved sourcing region code (MM, SEA, CN, EU, US, GLOBAL). */
export const BUYER_REGION_COOKIE = "eisy_buyer_region";

export const DEFAULT_BUYER_COUNTRY = "MM";
/** Default marketplace / CJ sourcing region — worldwide catalog, not Myanmar-only. */
export const DEFAULT_BUYER_REGION = "GLOBAL";
/** CJ Dropshipping catalog + import flows always default to the global region. */
export const DEFAULT_CJ_SOURCING_REGION = "GLOBAL";

/**
 * CJ Dropshipping official destination countries for checkout / address selectors.
 * Myanmar first, then GCC (AE/BH/KW/OM/QA/SA), then remaining CJ destinations A–Z.
 * Live refresh available via `/api/shipping/cj-countries`.
 * Freight checks still decide whether a destination is shippable for a given cart.
 */
export const BUYER_COUNTRY_OPTIONS = ALL_COUNTRY_OPTIONS;

/** Offline fallback when Supabase regions are unavailable. */
export const FALLBACK_REGIONS: {
  code: string;
  name: string;
  country_codes: string[];
  is_default: boolean;
}[] = [
  { code: "MM", name: "Myanmar", country_codes: ["MM"], is_default: false },
  {
    code: "SEA",
    name: "Southeast Asia",
    country_codes: ["TH", "SG", "MY", "ID", "VN", "KH", "LA", "PH", "BN"],
    is_default: false,
  },
  {
    code: "CN",
    name: "China / East Asia",
    country_codes: ["CN", "HK", "TW", "KR", "JP"],
    is_default: false,
  },
  {
    code: "EU",
    name: "Europe",
    country_codes: [
      "DE",
      "FR",
      "IT",
      "ES",
      "NL",
      "BE",
      "PL",
      "SE",
      "AT",
      "IE",
      "PT",
      "GB",
    ],
    is_default: false,
  },
  {
    code: "US",
    name: "North America",
    country_codes: ["US", "CA", "MX"],
    is_default: false,
  },
  {
    code: "GCC",
    name: "Gulf Cooperation Council",
    country_codes: ["AE", "BH", "KW", "OM", "QA", "SA"],
    is_default: false,
  },
  { code: "GLOBAL", name: "Rest of world", country_codes: [], is_default: true },
];

export function normalizeCountryCode(value: string | null | undefined): string {
  const code = String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_BUYER_COUNTRY;
}

export function matchRegionCodeForCountry(
  countryCode: string,
  regions: { code: string; country_codes: string[]; is_default?: boolean }[],
): string {
  const code = normalizeCountryCode(countryCode);
  const match = regions.find((region) => region.country_codes.includes(code));
  if (match) {
    return match.code;
  }
  // Unlisted destinations map to GLOBAL (rest of world), not the default marketplace region.
  const global =
    regions.find((region) => region.code === "GLOBAL") ??
    regions.find((region) => region.country_codes.length === 0);
  if (global) {
    return global.code;
  }
  const fallback =
    regions.find((region) => region.is_default) ??
    regions.find((region) => region.code === DEFAULT_BUYER_REGION) ??
    regions[0];
  return fallback?.code ?? DEFAULT_BUYER_REGION;
}

/** Strict UUID check for `sourcing_regions.id` and related FK columns. */
const SOURCING_REGION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a real Postgres uuid suitable for sourcing_regions FKs.
 * Rejects offline placeholders like `fallback-GLOBAL`.
 */
export function isSourcingRegionUuid(
  value: string | null | undefined,
): value is string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed.startsWith("fallback-")) return false;
  return SOURCING_REGION_UUID_RE.test(trimmed);
}

/** Return a DB-safe region uuid, or `null` (never a text placeholder). */
export function sanitizeSourcingRegionId(
  value: string | null | undefined,
): string | null {
  const trimmed = String(value ?? "").trim();
  return isSourcingRegionUuid(trimmed) ? trimmed : null;
}

/** Filter form/API region id lists down to persisted uuids only. */
export function sanitizeSourcingRegionIds(
  values: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = sanitizeSourcingRegionId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
