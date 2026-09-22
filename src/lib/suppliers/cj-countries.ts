import "server-only";

import {
  ALL_COUNTRY_OPTIONS,
  GCC_COUNTRY_OPTIONS,
  type CountryOption,
} from "@/lib/sourcing/countries";

const CJ_COUNTRY_LIST_URL =
  process.env.CJ_COUNTRY_LIST_URL?.trim() ||
  "https://www.cjdropshipping.com/app/account/countrylist";

const LABEL_OVERRIDES: Record<string, string> = {
  AE: "United Arab Emirates",
  BA: "Bosnia and Herzegovina",
  BO: "Bolivia",
  BQ: "Caribbean Netherlands",
  BS: "Bahamas",
  BV: "Bouvet Island",
  CD: "Congo (DRC)",
  CF: "Central African Republic",
  CG: "Congo",
  CI: "Côte d'Ivoire",
  CK: "Cook Islands",
  CV: "Cape Verde",
  DO: "Dominican Republic",
  FK: "Falkland Islands",
  FM: "Micronesia",
  FO: "Faroe Islands",
  GB: "United Kingdom",
  GM: "Gambia",
  GS: "South Georgia and South Sandwich Islands",
  HK: "Hong Kong",
  HM: "Heard Island and McDonald Islands",
  IR: "Iran",
  KP: "North Korea",
  KR: "South Korea",
  KV: "Kosovo",
  KY: "Cayman Islands",
  LA: "Laos",
  MD: "Moldova",
  MH: "Marshall Islands",
  MK: "North Macedonia",
  MM: "Myanmar",
  MO: "Macao",
  MP: "Northern Mariana Islands",
  NE: "Niger",
  NL: "Netherlands",
  PH: "Philippines",
  PN: "Pitcairn Islands",
  PS: "Palestine",
  RU: "Russia",
  SH: "Saint Helena",
  ST: "São Tomé and Príncipe",
  SX: "Sint Maarten",
  SY: "Syria",
  SZ: "Eswatini",
  TC: "Turks and Caicos Islands",
  TW: "Taiwan",
  TZ: "Tanzania",
  UM: "United States Minor Outlying Islands",
  US: "United States",
  VA: "Vatican City",
  VE: "Venezuela",
  VG: "British Virgin Islands",
  VI: "United States Virgin Islands",
  VN: "Vietnam",
};

function cleanLabel(code: string, nameEn: string): string {
  if (LABEL_OVERRIDES[code]) return LABEL_OVERRIDES[code];
  return String(nameEn || code)
    .replace(/\s*\(the\)\s*/gi, " ")
    .replace(/\s*\(China\)\s*/gi, "")
    .replace(/\s*\(Province of China\)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize CJ countrylist rows into checkout options.
 * Pins Myanmar first, then GCC, then A–Z.
 */
export function orderCjDestinationCountries(
  countries: CountryOption[],
): CountryOption[] {
  const byCode = new Map<string, CountryOption>();
  for (const country of countries) {
    const code = country.code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    byCode.set(code, {
      code,
      label: country.label.trim() || cleanLabel(code, country.label),
    });
  }
  for (const gcc of GCC_COUNTRY_OPTIONS) {
    if (!byCode.has(gcc.code)) byCode.set(gcc.code, gcc);
  }

  const all = [...byCode.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "en"),
  );
  const myanmar = all.find((c) => c.code === "MM");
  const gccCodes = new Set(GCC_COUNTRY_OPTIONS.map((g) => g.code));
  const gcc = GCC_COUNTRY_OPTIONS.slice().sort((a, b) =>
    a.label.localeCompare(b.label, "en"),
  );
  const rest = all.filter((c) => c.code !== "MM" && !gccCodes.has(c.code));

  const ordered = [...(myanmar ? [myanmar] : []), ...gcc, ...rest];
  const seen = new Set<string>();
  const final: CountryOption[] = [];
  for (const country of ordered) {
    if (seen.has(country.code)) continue;
    seen.add(country.code);
    final.push(country);
  }
  return final;
}

/**
 * Live fetch of CJ's official destination country list.
 * Falls back to the bundled snapshot when the network/API is unavailable.
 */
export async function fetchCjDestinationCountries(): Promise<{
  countries: CountryOption[];
  source: "cj_live" | "static_fallback";
}> {
  try {
    const response = await fetch(CJ_COUNTRY_LIST_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      throw new Error(`CJ country list HTTP ${response.status}`);
    }
    const outer = (await response.json()) as {
      result?: unknown;
      message?: string;
      statusCode?: string;
    };
    const raw =
      typeof outer.result === "string"
        ? (JSON.parse(outer.result) as unknown)
        : outer.result;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("CJ country list returned an empty payload.");
    }

    const parsed: CountryOption[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const code = String(rec.id ?? rec.code ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) continue;
      const nameEn = String(rec.nameEn ?? rec.name ?? rec.label ?? code);
      parsed.push({ code, label: cleanLabel(code, nameEn) });
    }

    if (parsed.length < 50) {
      throw new Error("CJ country list looked incomplete.");
    }

    return {
      countries: orderCjDestinationCountries(parsed),
      source: "cj_live",
    };
  } catch {
    return {
      countries: orderCjDestinationCountries(ALL_COUNTRY_OPTIONS),
      source: "static_fallback",
    };
  }
}
