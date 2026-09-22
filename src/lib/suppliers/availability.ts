import type { ExternalSupplierKind } from "@/lib/suppliers/types";

/**
 * Temporary platform focus: only CJ Dropshipping is live in vendor UIs.
 * Other sources remain in the codebase but are shown as Coming Soon.
 */
export const PRIMARY_SUPPLIER_KIND =
  "cj_dropshipping" as const satisfies ExternalSupplierKind;

export const ACTIVE_CATALOG_SUPPLIER_KINDS: readonly ExternalSupplierKind[] = [
  PRIMARY_SUPPLIER_KIND,
];

export const COMING_SOON_SUPPLIER_KINDS: readonly ExternalSupplierKind[] = [
  "dsers",
  "spocket",
  "printful",
  "printify",
];

/** Sourcing tabs that remain searchable / selectable. */
export const ACTIVE_SUPPLIER_SOURCE_TABS = ["cj_dropshipping"] as const;

/** Sourcing tabs shown but disabled as Coming Soon. */
export const COMING_SOON_SUPPLIER_SOURCE_TABS = [
  "dsers",
  "spocket",
  "pod",
] as const;

export function isActiveSupplierKind(kind: ExternalSupplierKind): boolean {
  return (ACTIVE_CATALOG_SUPPLIER_KINDS as readonly string[]).includes(kind);
}

export function isComingSoonSupplierKind(kind: ExternalSupplierKind): boolean {
  return (COMING_SOON_SUPPLIER_KINDS as readonly string[]).includes(kind);
}
