import type { ProductSpecification } from "@/lib/types/database";

export type { ProductSpecification };

export const MAX_PRODUCT_SPECIFICATIONS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize DB/json values into a clean ordered list of key/value pairs.
 * Accepts either [{key,value}, ...] or a flat { Color: "Black", ... } object.
 */
export function normalizeProductSpecifications(
  input: unknown,
): ProductSpecification[] {
  if (input == null) {
    return [];
  }

  if (Array.isArray(input)) {
    const specs: ProductSpecification[] = [];
    for (const item of input) {
      if (!isRecord(item)) {
        continue;
      }
      const key = String(item.key ?? item.name ?? "").trim();
      const value = String(item.value ?? "").trim();
      if (!key || !value) {
        continue;
      }
      specs.push({ key, value });
    }
    return specs;
  }

  if (isRecord(input)) {
    return Object.entries(input)
      .map(([key, value]) => ({
        key: key.trim(),
        value: String(value ?? "").trim(),
      }))
      .filter((spec) => spec.key.length > 0 && spec.value.length > 0);
  }

  return [];
}

/**
 * Read parallel `spec_key` / `spec_value` fields from a product form.
 */
export function parseProductSpecificationsFromFormData(
  formData: FormData,
): { specifications: ProductSpecification[]; error?: string } {
  const keys = formData.getAll("spec_key").map((value) => String(value).trim());
  const values = formData
    .getAll("spec_value")
    .map((value) => String(value).trim());

  const length = Math.max(keys.length, values.length);
  const specifications: ProductSpecification[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < length; index += 1) {
    const key = keys[index] ?? "";
    const value = values[index] ?? "";

    if (!key && !value) {
      continue;
    }

    if (!key || !value) {
      return {
        specifications: [],
        error: "Each specification needs both a name and a value.",
      };
    }

    if (key.length > 80) {
      return {
        specifications: [],
        error: "Specification names must be 80 characters or fewer.",
      };
    }

    if (value.length > 200) {
      return {
        specifications: [],
        error: "Specification values must be 200 characters or fewer.",
      };
    }

    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) {
      return {
        specifications: [],
        error: `Duplicate specification "${key}". Use each name once.`,
      };
    }
    seen.add(normalizedKey);
    specifications.push({ key, value });
  }

  if (specifications.length > MAX_PRODUCT_SPECIFICATIONS) {
    return {
      specifications: [],
      error: `You can add up to ${MAX_PRODUCT_SPECIFICATIONS} specifications.`,
    };
  }

  return { specifications };
}
