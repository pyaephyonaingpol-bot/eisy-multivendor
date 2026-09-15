import type { VendorImportQuota } from "@/lib/import-limits/queries";

type Props = {
  quota: VendorImportQuota;
  className?: string;
};

function limitSourceLabel(source: VendorImportQuota["limit_source"]) {
  switch (source) {
    case "vendor_override":
      return "custom account cap";
    case "subscription_plan":
      return "subscription plan";
    default:
      return "system default";
  }
}

export function ImportQuotaBanner({ quota, className }: Props) {
  const pct = Math.min(
    100,
    Math.round((quota.catalog_item_count / Math.max(quota.max_import_items, 1)) * 100),
  );
  const nearLimit = quota.remaining_import_slots <= 5;
  const belowMin =
    quota.active_item_count > 0 &&
    quota.active_item_count < quota.min_active_items;

  return (
    <div
      className={
        className ??
        "space-y-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-950">
            Import quota · {quota.catalog_item_count} / {quota.max_import_items}{" "}
            items
          </p>
          <p className="text-sm text-zinc-600">
            {quota.remaining_import_slots} slot
            {quota.remaining_import_slots === 1 ? "" : "s"} remaining (
            {limitSourceLabel(quota.limit_source)}, {quota.plan} plan). Active
            listings: {quota.active_item_count}. Monthly fee floor:{" "}
            {quota.min_active_items} × {quota.item_fee_usdt} USDT when any
            listing is active.
          </p>
        </div>
        {quota.at_import_limit ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200">
            Limit reached
          </span>
        ) : nearLimit ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
            Near limit
          </span>
        ) : null}
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-valuenow={quota.catalog_item_count}
        aria-valuemin={0}
        aria-valuemax={quota.max_import_items}
        aria-label="Imported catalog usage"
      >
        <div
          className={`h-full rounded-full transition-all ${
            quota.at_import_limit
              ? "bg-red-500"
              : nearLimit
                ? "bg-amber-500"
                : "bg-zinc-900"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {belowMin ? (
        <p className="text-sm text-amber-800">
          You have {quota.active_item_count} active item
          {quota.active_item_count === 1 ? "" : "s"}. Dropshippers are billed for
          at least {quota.min_active_items} active items (
          {quota.min_active_items * quota.item_fee_usdt} USDT/mo). Import more
          active listings or expect the minimum fee.
        </p>
      ) : null}
    </div>
  );
}
