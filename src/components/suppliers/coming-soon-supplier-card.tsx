type Props = {
  label: string;
  description?: string;
};

/** Non-interactive placeholder for suppliers not yet enabled on the platform. */
export function ComingSoonSupplierCard({
  label,
  description = "This supplier will be available in a future update. For now, import products from CJ Dropshipping.",
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 opacity-90">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-500">
            {label}
          </h2>
          <p className="max-w-xl text-sm text-zinc-500">{description}</p>
        </div>
        <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          Coming Soon
        </span>
      </div>
      <div
        className="pointer-events-none mt-4 h-24 rounded-lg border border-zinc-200 bg-white/60"
        aria-hidden
      />
    </div>
  );
}
