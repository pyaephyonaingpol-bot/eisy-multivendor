import { formatMoney, MARKETPLACE_CURRENCY } from "@/lib/money";
import type { ResolvedSupplierRoute } from "@/lib/types/database";

type RegionalShippingEstimateProps = {
  route: ResolvedSupplierRoute | null;
  countryCode: string;
  regionName: string;
};

function daysLabel(min: number | null, max: number | null) {
  if (min == null && max == null) {
    return "Estimate pending";
  }
  if (min != null && max != null) {
    return min === max ? `${min} days` : `${min}–${max} days`;
  }
  return `${min ?? max} days`;
}

export function RegionalShippingEstimate({
  route,
  countryCode,
  regionName,
}: RegionalShippingEstimateProps) {
  if (!route) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Set your shipping country in the header to see regional supplier routing.
      </div>
    );
  }

  const shippingCost = Number(route.shipping_cost_usdt ?? 0);

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-950">Ships to {regionName}</p>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
          {route.provider_name}
        </span>
      </div>
      <p className="text-zinc-600">
        Warehouse {route.warehouse_country} ·{" "}
        {daysLabel(route.shipping_days_min, route.shipping_days_max)} · Country{" "}
        {countryCode}
      </p>
      <p className="text-zinc-600">
        Regional shipping:{" "}
        <span className="font-medium text-zinc-950">
          {shippingCost <= 0
            ? "Included / free estimate"
            : formatMoney(shippingCost, MARKETPLACE_CURRENCY)}
        </span>
      </p>
      <p className="text-xs text-zinc-500">
        Catalog routing prefers nearby CJ Dropshipping, DSers, Print-on-Demand, or
        internal EISY stock for your region. Checkout remains USDT-only.
      </p>
    </div>
  );
}
