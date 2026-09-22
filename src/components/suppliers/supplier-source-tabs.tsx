"use client";

import type { SupplierSourceTab } from "@/lib/suppliers";
import {
  ACTIVE_SUPPLIER_SOURCE_TABS,
  COMING_SOON_SUPPLIER_SOURCE_TABS,
} from "@/lib/suppliers/availability";

type Translate = (
  path: string,
  vars?: Record<string, string | number>,
) => string;

export const SUPPLIER_SOURCE_TAB_IDS: SupplierSourceTab[] = [
  ...(ACTIVE_SUPPLIER_SOURCE_TABS as readonly SupplierSourceTab[]),
  ...(COMING_SOON_SUPPLIER_SOURCE_TABS as readonly SupplierSourceTab[]),
];

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
 * Only CJ is selectable for now; other sources show Coming Soon.
 */
export function SupplierSourceTabs({ value, onChange, t, counts }: Props) {
  const comingSoonSet = new Set<string>(COMING_SOON_SUPPLIER_SOURCE_TABS);

  return (
    <div
      className="flex max-w-full flex-wrap gap-2"
      role="tablist"
      aria-label={t("sourcing.sourceTabsLabel")}
    >
      {SUPPLIER_SOURCE_TAB_IDS.map((tabId) => {
        const comingSoon = comingSoonSet.has(tabId);
        const active = value === tabId && !comingSoon;
        const count = counts?.[tabId];
        return (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={comingSoon}
            title={comingSoon ? "Coming soon" : undefined}
            onClick={() => {
              if (!comingSoon) onChange(tabId);
            }}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition ${
              comingSoon
                ? "cursor-not-allowed border border-dashed border-zinc-200 bg-zinc-50 text-zinc-400"
                : active
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {supplierSourceTabLabel(tabId, t)}
            {comingSoon ? (
              <span className="ms-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700/80">
                Soon
              </span>
            ) : typeof count === "number" ? (
              <span
                className={`ms-1.5 tabular-nums text-xs ${
                  active ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                ({count})
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
