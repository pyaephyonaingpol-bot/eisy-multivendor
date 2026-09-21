import { ALL_COUNTRY_OPTIONS } from "@/lib/sourcing/countries";

/** Cookie storing the buyer destination country (ISO-ish, e.g. MM, TH, US). */
export const BUYER_COUNTRY_COOKIE = "eisy_buyer_country";

/** Cookie storing the resolved sourcing region code (MM, SEA, CN, EU, US, GLOBAL). */
export const BUYER_REGION_COOKIE = "eisy_buyer_region";

export const DEFAULT_BUYER_COUNTRY = "MM";
export const DEFAULT_BUYER_REGION = "MM";

/**
 * Full ISO 3166-1 alpha-2 country list for checkout / address / profile selectors.
 * Myanmar is listed first; remaining countries are alphabetical.
 * CJ freight checks still decide whether a destination is shippable at quote time.
 */
export const BUYER_COUNTRY_OPTIONS = ALL_COUNTRY_OPTIONS;

/** Offline fallback when Supabase regions are unavailable. */
export const FALLBACK_REGIONS: {
  code: string;
  name: string;
  country_codes: string[];
  is_default: boolean;
}[] = [
  { code: "MM", name: "Myanmar", country_codes: ["MM"], is_default: true },
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
  { code: "GLOBAL", name: "Rest of world", country_codes: [], is_default: false },
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
