import { formatMoney } from "@/lib/money";
import type { RegionProductPrice } from "@/lib/shipping/region-pricing";

export function ShippingOfferBadge({
  pricing,
  className = "",
}: {
  pricing: Pick<
    RegionProductPrice,
    "shippingLabel" | "freeShipping" | "targetMarket"
  >;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        pricing.freeShipping
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
          : "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200"
      } ${className}`}
    >
      {pricing.shippingLabel}
      {pricing.targetMarket !== "GLOBAL" ? ` · ${pricing.targetMarket}` : ""}
    </span>
  );
}

export function RegionPriceDisplay({
  pricing,
  size = "md",
  showSettlement = true,
}: {
  pricing: RegionProductPrice;
  size?: "sm" | "md" | "lg";
  showSettlement?: boolean;
}) {
  const priceClass =
    size === "lg"
      ? "text-2xl font-semibold text-zinc-950"
      : size === "sm"
        ? "text-sm font-semibold text-zinc-950"
        : "text-xl font-semibold text-zinc-950";

  return (
    <div className="space-y-1">
      <p className={priceClass}>
        {formatMoney(pricing.displayAmount, pricing.displayCurrency)}
      </p>
      {showSettlement && pricing.displayCurrency !== "USDT" ? (
        <p className="text-xs text-zinc-500">
          Settles as {formatMoney(pricing.priceUsdt, "USDT")}
          {pricing.bufferUsdt > 0
            ? ` (incl. ${formatMoney(pricing.bufferUsdt, "USDT")} ship buffer)`
            : ""}
        </p>
      ) : pricing.bufferUsdt > 0 ? (
        <p className="text-xs text-zinc-500">
          Incl. {formatMoney(pricing.bufferUsdt, "USDT")} ship buffer
        </p>
      ) : null}
      <ShippingOfferBadge pricing={pricing} />
    </div>
  );
}
