/**
 * Map CJ Dropshipping /product/query fields onto marketplace listing copy,
 * specifications, and category hints used during import.
 */

import {
  MAX_PRODUCT_SPECIFICATIONS,
  normalizeProductSpecifications,
} from "@/lib/products/specifications";
import type { Category, ProductSpecification } from "@/lib/types/database";

export type CjCategoryHint = {
  externalCategoryId: string | null;
  externalCategoryName: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickCjText(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const asNum = String(candidate).trim();
      if (asNum) return asNum;
      continue;
    }
    if (typeof candidate !== "string") continue;
    const text = candidate.trim();
    if (
      !text ||
      text.toLowerCase() === "null" ||
      text.toLowerCase() === "undefined"
    ) {
      continue;
    }
    return text;
  }
  return null;
}

/** Decode CJ list fields that arrive as JSON strings or string[]. */
function pickCjStringList(...candidates: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (value == null) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      const text = String(value).trim();
      if (text && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        out.push(text);
      }
      return;
    }
    if (typeof value !== "string") return;
    const text = value.trim();
    if (
      !text ||
      text.toLowerCase() === "null" ||
      text.toLowerCase() === "undefined"
    ) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      for (const item of candidate) push(item);
      continue;
    }
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (Array.isArray(parsed)) {
            for (const item of parsed) push(item);
            continue;
          }
        } catch {
          // fall through to treat as a plain string
        }
      }
      push(trimmed);
    }
  }

  return out;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

/**
 * CJ product descriptions are often HTML. Storefront renders plain text, so
 * convert tags into readable line breaks before save.
 */
export function cjHtmlToPlainText(input: string): string {
  const withBreaks = input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|tr|li|section|article)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\/\s*td\s*>/gi, "\t")
    .replace(/<\/\s*th\s*>/gi, "\t")
    .replace(/<\s*\/?\s*table[^>]*>/gi, "\n")
    .replace(/<\s*\/?\s*thead[^>]*>/gi, "\n")
    .replace(/<\s*\/?\s*tbody[^>]*>/gi, "\n")
    .replace(/<\s*tr[^>]*>/gi, "\n");

  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefer a real CJ description over title fallback; normalize HTML → text. */
export function extractCjDescription(
  row: Record<string, unknown>,
  titleFallback: string,
): string {
  const raw =
    pickCjText(row.description, row.productDescription, row.desc) ?? "";
  if (!raw) {
    return titleFallback;
  }
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
  const plain = looksLikeHtml ? cjHtmlToPlainText(raw) : raw.trim();
  // Avoid storing a near-empty HTML shell as the listing description.
  if (!plain || plain.length < 8) {
    return titleFallback;
  }
  // Cap extreme HTML leftovers so import payloads stay bounded.
  return plain.length > 12000 ? `${plain.slice(0, 12000)}…` : plain;
}

function formatWeightGrams(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    const asText = pickCjText(value);
    return asText;
  }
  if (n >= 1000) {
    const kg = Math.round((n / 1000) * 100) / 100;
    return `${kg} kg`;
  }
  return `${Math.round(n)} g`;
}

function pushSpec(
  specs: ProductSpecification[],
  seen: Set<string>,
  key: string,
  value: string | null | undefined,
) {
  const k = key.trim();
  const v = String(value ?? "").trim();
  if (!k || !v) return;
  const dedupe = k.toLowerCase();
  if (seen.has(dedupe)) return;
  if (specs.length >= MAX_PRODUCT_SPECIFICATIONS) return;
  seen.add(dedupe);
  specs.push({ key: k.slice(0, 80), value: v.slice(0, 200) });
}

/**
 * Build marketplace `products.specifications` from CJ detail attributes.
 */
export function extractCjSpecifications(
  row: Record<string, unknown>,
): ProductSpecification[] {
  const specs: ProductSpecification[] = [];
  const seen = new Set<string>();

  pushSpec(specs, seen, "Weight", formatWeightGrams(row.productWeight));
  pushSpec(
    specs,
    seen,
    "Packing weight",
    formatWeightGrams(row.packingWeight ?? row.packWeight),
  );
  pushSpec(specs, seen, "Unit", pickCjText(row.productUnit));

  const materials = pickCjStringList(
    row.materialNameEnSet,
    row.materialNameEn,
    row.materialNameSet,
    row.materialName,
  );
  if (materials.length) {
    pushSpec(specs, seen, "Material", materials.join(", "));
  }

  const packing = pickCjStringList(
    row.packingNameEnSet,
    row.packingNameEn,
    row.packingNameSet,
    row.packingName,
  );
  if (packing.length) {
    pushSpec(specs, seen, "Packaging", packing.join(", "));
  }

  pushSpec(
    specs,
    seen,
    "Attributes",
    pickCjText(row.productKeyEn, row.productKey),
  );

  const properties = pickCjStringList(
    row.productProEnSet,
    row.productProEn,
    row.productProSet,
    row.productPro,
  );
  if (properties.length) {
    pushSpec(specs, seen, "Product type", properties.join(", "));
  }

  pushSpec(
    specs,
    seen,
    "Customs name",
    pickCjText(row.entryNameEn, row.entryName),
  );
  pushSpec(specs, seen, "HS code", pickCjText(row.entryCode));

  // Some CJ payloads nest extra attribute pairs under productProperty* or lists.
  for (const key of [
    "productProperty1",
    "productProperty2",
    "productProperty3",
  ] as const) {
    const value = pickCjText(row[key]);
    if (value) {
      pushSpec(specs, seen, `Property ${key.slice(-1)}`, value);
    }
  }

  const nestedAttrs =
    row.productAttributeList ??
    row.attributeList ??
    row.attributes ??
    row.productAttributes;
  if (Array.isArray(nestedAttrs)) {
    for (const item of nestedAttrs) {
      const rec = asRecord(item);
      if (!rec) continue;
      const key = pickCjText(
        rec.nameEn,
        rec.attrNameEn,
        rec.key,
        rec.name,
        rec.attributeName,
      );
      const value = pickCjText(
        rec.valueEn,
        rec.attrValueEn,
        rec.value,
        rec.attributeValue,
      );
      if (key && value) {
        pushSpec(specs, seen, key, value);
      }
    }
  }

  return normalizeProductSpecifications(specs).slice(
    0,
    MAX_PRODUCT_SPECIFICATIONS,
  );
}

export function extractCjCategoryHint(
  row: Record<string, unknown>,
): CjCategoryHint {
  return {
    externalCategoryId:
      pickCjText(
        row.categoryId,
        row.threeCategoryId,
        row.category_id,
      ) ?? null,
    externalCategoryName:
      pickCjText(
        row.categoryName,
        row.threeCategoryName,
        row.category_name,
      ) ?? null,
  };
}

const MARKETPLACE_CATEGORY_KEYWORDS: Array<{
  slug: string;
  keywords: string[];
}> = [
  {
    slug: "electronics",
    keywords: [
      "electronic",
      "electronics",
      "phone",
      "mobile",
      "computer",
      "pc ",
      "gadget",
      "camera",
      "audio",
      "earphone",
      "headphone",
      "charger",
      "tablet",
      "smart",
    ],
  },
  {
    slug: "fashion",
    keywords: [
      "fashion",
      "apparel",
      "clothing",
      "clothes",
      "shoe",
      "wear",
      "jewelry",
      "jewellery",
      "beauty",
      "bag",
      "watch",
      "cosmetic",
      "dress",
      "men",
      "women",
    ],
  },
  {
    slug: "home-living",
    keywords: [
      "home",
      "garden",
      "furniture",
      "kitchen",
      "household",
      "storage",
      "decor",
      "living",
      "office",
      "pet",
      "tool",
      "outdoor",
    ],
  },
  {
    slug: "digital-goods",
    keywords: ["digital", "software", "download", "ebook", "license", "code"],
  },
];

function slugifyCategoryFragment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitCjCategoryPath(name: string): string[] {
  return name
    .split(/[>/|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Map a CJ category path onto a marketplace `categories.id`.
 * Falls back to the "Other" category when no better match exists.
 */
export function matchMarketplaceCategoryId(
  categories: Pick<Category, "id" | "name" | "slug">[],
  cjCategoryName: string | null | undefined,
): string | null {
  if (!categories.length) return null;

  const bySlug = new Map(
    categories.map((category) => [category.slug.toLowerCase(), category.id]),
  );
  const byName = new Map(
    categories.map((category) => [
      category.name.trim().toLowerCase(),
      category.id,
    ]),
  );
  const otherId = bySlug.get("other") ?? null;

  const hint = String(cjCategoryName ?? "").trim();
  if (!hint) {
    return otherId;
  }

  const segments = splitCjCategoryPath(hint);
  for (const segment of segments) {
    const nameHit = byName.get(segment.toLowerCase());
    if (nameHit) return nameHit;
    const slugHit = bySlug.get(slugifyCategoryFragment(segment));
    if (slugHit) return slugHit;
  }

  // Full-string exact name / slug.
  const fullName = byName.get(hint.toLowerCase());
  if (fullName) return fullName;
  const fullSlug = bySlug.get(slugifyCategoryFragment(hint));
  if (fullSlug) return fullSlug;

  const haystack = hint.toLowerCase();
  for (const rule of MARKETPLACE_CATEGORY_KEYWORDS) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      const id = bySlug.get(rule.slug);
      if (id) return id;
    }
  }

  return otherId;
}
