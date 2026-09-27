import Link from "next/link";
import type { TargetMarket } from "@/lib/shipping/region-pricing";

export const ORDER_MARKET_TABS: Array<{
  id: "ALL" | TargetMarket;
  label: string;
}> = [
  { id: "ALL", label: "All" },
  { id: "AE", label: "UAE" },
  { id: "PH", label: "PH" },
  { id: "MM", label: "MM" },
  { id: "GLOBAL", label: "Global" },
];

export function VendorOrderMarketTabs({
  basePath,
  active,
  counts,
}: {
  basePath: string;
  active: "ALL" | TargetMarket;
  counts?: Partial<Record<"ALL" | TargetMarket, number>>;
}) {
  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {ORDER_MARKET_TABS.map((tab) => {
        const href =
          tab.id === "ALL" ? basePath : `${basePath}?market=${tab.id}`;
        const selected = active === tab.id;
        const count = counts?.[tab.id];
        return (
          <Link
            key={tab.id}
            href={href}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              selected
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
            {count != null ? (
              <span className="ml-1 opacity-80">({count})</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function parseOrderMarketParam(
  value: string | null | undefined,
): "ALL" | TargetMarket {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "AE" || raw === "PH" || raw === "MM" || raw === "GLOBAL") {
    return raw;
  }
  return "ALL";
}

export function orderMatchesMarket(
  order: {
    target_market?: string | null;
    buyer_country_code?: string | null;
  },
  market: "ALL" | TargetMarket,
): boolean {
  if (market === "ALL") return true;
  const stored = String(order.target_market ?? "")
    .trim()
    .toUpperCase();
  if (stored === market) return true;
  const country = String(order.buyer_country_code ?? "")
    .trim()
    .toUpperCase();
  if (market === "GLOBAL") {
    return stored === "GLOBAL" || (country !== "" && !["AE", "PH", "MM"].includes(country));
  }
  return country === market || stored === market;
}

export function shippingTypeLabel(
  shippingType: string | null | undefined,
): string {
  if (shippingType === "included") return "Free Shipping";
  if (shippingType === "plus_shipping") return "Plus Shipping Fee";
  return "Shipping TBD";
}
