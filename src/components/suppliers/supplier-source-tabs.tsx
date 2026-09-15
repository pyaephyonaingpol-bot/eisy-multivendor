"use client";

import type { SupplierSourceTab } from "@/lib/suppliers";

export const SUPPLIER_SOURCE_TAB_IDS: SupplierSourceTab[] = [
  "all",
  "dsers",
  "cj_dropshipping",
  "spocket",
  "pod",
];

type Translate = (
  path: string,
  vars?: Record<string, string | number>,
) => string;

export function supplierSourceTabLabel(
  tab: SupplierSourceTab,
  t: Translate,
): string {
  switch (tab) {
    case "all":
      return t("sourcing.sources.all");
    case "dsers":
      return t("sourcing.sources.dsers");
    case "cj_dropshipping":
      return t("sourcing.sources.cj");
    case "spocket":
      return t("sourcing.sources.spocket");
    case "pod":
      return t("sourcing.sources.pod");
    default:
      return tab;
  }
}

type Props = {
  value: SupplierSourceTab;
  onChange: (tab: SupplierSourceTab) => void;
  t: Translate;
  counts?: Partial<Record<SupplierSourceTab, number>>;
};

/**
 * Source selection tabs for the dropshipper sourcing catalog.
 * Clicking a tab filters the product grid to that supplier (or All).
 */
export function SupplierSourceTabs({ value, onChange, t, counts }: Props) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label={t("sourcing.sourceTabsLabel")}
    >
      {SUPPLIER_SOURCE_TAB_IDS.map((tabId) => {
        const active = value === tabId;
        const count = counts?.[tabId];
        return (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tabId)}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-zinc-950 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {supplierSourceTabLabel(tabId, t)}
            {typeof count === "number" ? (
              <span
                className={`ms-1.5 text-xs ${
                  active ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
