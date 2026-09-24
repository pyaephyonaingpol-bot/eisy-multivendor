/**
 * Parse catalog variant labels into selectable option axes (Color, Size, …)
 * so buyers can pick combinations instead of scrolling a flat dropdown.
 */

export type CatalogVariantLike = {
  externalVariantId: string;
  label: string;
  stockQuantity?: number | null;
  imageUrl?: string | null;
  priceUsdt?: number | null;
  externalSku?: string | null;
};

export type VariantAxis = {
  /** Stable key used in selection maps. */
  id: string;
  /** Buyer-facing axis title (Color, Size, Option 1, …). */
  name: string;
  /** Distinct values for this axis, in first-seen order. */
  values: string[];
};

export type ParsedVariantMatrix = {
  axes: VariantAxis[];
  /** Parallel to input variants: axis value per axis index. */
  partsByVariantId: Record<string, string[]>;
};

const SIZE_TOKEN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d{1,2}(\.\d)?)$/i;

const COLOR_HINT =
  /^(black|white|red|blue|green|yellow|orange|purple|pink|brown|grey|gray|beige|navy|gold|silver|cream|khaki|maroon|cyan|magenta|ivory|olive|teal|coral|burgundy|champagne|multicolor|multi)$/i;

function splitLabel(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];

  // "Color:Black;Size:M" or "Color=Black, Size=M"
  if (/[:=]/.test(trimmed) && /[;,]/.test(trimmed)) {
    return trimmed
      .split(/[;,]/)
      .map((part) => {
        const match = part.match(/^[^=:]+[=:](.+)$/);
        return (match?.[1] ?? part).trim();
      })
      .filter(Boolean);
  }

  // Most CJ labels: "Black / M", "White / XL"
  if (trimmed.includes(" / ")) {
    return trimmed
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (trimmed.includes(" | ")) {
    return trimmed
      .split(" | ")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  // "Black-M" / "Red-XXL" — only split on last hyphen when right side looks like a size
  const hyphen = trimmed.match(/^(.+)-([^-]+)$/);
  if (hyphen && SIZE_TOKEN.test(hyphen[2]!.trim())) {
    return [hyphen[1]!.trim(), hyphen[2]!.trim()].filter(Boolean);
  }

  return [trimmed];
}

function inferAxisName(values: string[], index: number, axisCount: number): string {
  const sample = values.slice(0, 12);
  const sizeHits = sample.filter((value) => SIZE_TOKEN.test(value.trim())).length;
  const colorHits = sample.filter((value) => COLOR_HINT.test(value.trim())).length;

  if (sizeHits >= Math.ceil(sample.length * 0.5)) return "Size";
  if (colorHits >= Math.ceil(sample.length * 0.4)) return "Color";
  if (axisCount === 2) return index === 0 ? "Color" : "Size";
  return `Option ${index + 1}`;
}

/**
 * Build option axes from variant labels. Falls back to a single "Option" axis
 * that lists full labels when parts are inconsistent.
 */
export function parseVariantMatrix(
  variants: CatalogVariantLike[],
): ParsedVariantMatrix {
  if (variants.length === 0) {
    return { axes: [], partsByVariantId: {} };
  }

  const partsList = variants.map((variant) => splitLabel(variant.label));
  const counts = new Set(partsList.map((parts) => parts.length));
  const consistent =
    counts.size === 1 && (partsList[0]?.length ?? 0) >= 1;

  if (!consistent || (partsList[0]?.length ?? 0) === 1) {
    // Flat list — one chip row using the full label.
    const values: string[] = [];
    const seen = new Set<string>();
    const partsByVariantId: Record<string, string[]> = {};
    for (const variant of variants) {
      const label = variant.label.trim() || variant.externalVariantId;
      partsByVariantId[variant.externalVariantId] = [label];
      if (!seen.has(label)) {
        seen.add(label);
        values.push(label);
      }
    }
    return {
      axes: [{ id: "option", name: "Option", values }],
      partsByVariantId,
    };
  }

  const axisCount = partsList[0]!.length;
  const valuesPerAxis: string[][] = Array.from({ length: axisCount }, () => []);
  const seenPerAxis: Array<Set<string>> = Array.from(
    { length: axisCount },
    () => new Set(),
  );
  const partsByVariantId: Record<string, string[]> = {};

  variants.forEach((variant, index) => {
    const parts = partsList[index]!;
    partsByVariantId[variant.externalVariantId] = parts;
    parts.forEach((part, axisIndex) => {
      if (!seenPerAxis[axisIndex]!.has(part)) {
        seenPerAxis[axisIndex]!.add(part);
        valuesPerAxis[axisIndex]!.push(part);
      }
    });
  });

  const axes: VariantAxis[] = valuesPerAxis.map((values, index) => ({
    id: `axis-${index}`,
    name: inferAxisName(values, index, axisCount),
    values,
  }));

  return { axes, partsByVariantId };
}

/** Find the variant that matches every selected axis value. */
export function matchVariantBySelection(
  variants: CatalogVariantLike[],
  partsByVariantId: Record<string, string[]>,
  selection: string[],
): CatalogVariantLike | null {
  if (selection.length === 0) return variants[0] ?? null;
  return (
    variants.find((variant) => {
      const parts = partsByVariantId[variant.externalVariantId];
      if (!parts || parts.length !== selection.length) return false;
      return parts.every((part, index) => part === selection[index]);
    }) ?? null
  );
}

/**
 * Whether choosing `value` on `axisIndex` (keeping other selections) maps to
 * at least one in-stock (or unknown-stock) variant.
 */
export function isAxisValueAvailable(
  variants: CatalogVariantLike[],
  partsByVariantId: Record<string, string[]>,
  selection: string[],
  axisIndex: number,
  value: string,
): boolean {
  const next = selection.slice();
  next[axisIndex] = value;
  return variants.some((variant) => {
    const parts = partsByVariantId[variant.externalVariantId];
    if (!parts || parts.length !== next.length) return false;
    if (!parts.every((part, index) => part === next[index])) return false;
    if (variant.stockQuantity == null) return true;
    return variant.stockQuantity > 0;
  });
}

export function selectionFromVariant(
  partsByVariantId: Record<string, string[]>,
  variantId: string | null | undefined,
  axisCount: number,
): string[] {
  if (!variantId) return Array.from({ length: axisCount }, () => "");
  const parts = partsByVariantId[variantId];
  if (!parts || parts.length !== axisCount) {
    return Array.from({ length: axisCount }, () => "");
  }
  return parts.slice();
}
