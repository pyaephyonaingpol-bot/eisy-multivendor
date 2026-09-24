import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { ResolvedSupplierRoute } from "@/lib/types/database";

type RegionalShippingEstimateProps = {
  route: ResolvedSupplierRoute | null;
  countryCode: string;
  regionName: string;
};

function daysLabel(min: number | null, max: number | null) {
  if (min == null && max == null) {
    return null;
  }
  if (min != null && max != null) {
    return min === max ? `${min} days` : `${min}–${max} days`;
  }
  return `${min ?? max} days`;
}

/**
 * Buyer-facing shipping summary for non-CJ listings.
 * Intentionally omits warehouse, provider, and catalog-routing details.
 */
export function RegionalShippingEstimate({
  route,
  countryCode,
  regionName,
}: RegionalShippingEstimateProps) {
  if (!route) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Shipping options appear at checkout for your delivery address.
      </div>
    );
  }

  const shippingCost = Number(route.shipping_cost_usdt ?? 0);
  const eta = daysLabel(route.shipping_days_min, route.shipping_days_max);
  const destination = regionName || countryCode;

  return (
    <div className="space-y-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <p className="font-medium text-zinc-950">Shipping</p>
      <p className="text-zinc-600">
        Delivers to {destination}
        {eta ? ` · ${eta}` : ""}
      </p>
      <p className="text-xs text-zinc-500">
        Based on your delivery address or profile country.
      </p>
      <p className="text-zinc-600">
        Estimated shipping:{" "}
        <span className="font-medium text-zinc-950">
          {shippingCost <= 0
            ? "Calculated at checkout"
            : formatMoney(shippingCost, MARKETPLACE_CURRENCY)}
        </span>
      </p>
    </div>
  );
}
