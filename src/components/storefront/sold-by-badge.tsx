import Link from "next/link";

export type SoldByVendor = {
  name: string;
  slug: string;
  logo_url?: string | null;
};

type SoldByBadgeProps = {
  vendor: SoldByVendor;
  /** Use "link" inside non-link parents; "text" inside ProductCard links. */
  as?: "link" | "text";
  className?: string;
  size?: "sm" | "md";
};

export function SoldByBadge({
  vendor,
  as = "link",
  className = "",
  size = "sm",
}: SoldByBadgeProps) {
  const logoSize = size === "md" ? "h-7 w-7" : "h-5 w-5";
  const textSize = size === "md" ? "text-sm" : "text-xs";
  const content = (
    <>
      {vendor.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vendor.logo_url}
          alt=""
          className={`${logoSize} rounded-full object-cover ring-1 ring-zinc-200`}
        />
      ) : (
        <span
          className={`inline-flex ${logoSize} items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200`}
          aria-hidden
        >
          {vendor.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`${textSize} min-w-0 break-words text-zinc-600`}>
        Sold by{" "}
        <span className="break-words font-medium text-zinc-900">{vendor.name}</span>
      </span>
    </>
  );

  const classes = `inline-flex max-w-full min-w-0 items-center gap-1.5 ${className}`.trim();

  if (as === "text") {
    return <span className={classes}>{content}</span>;
  }

  return (
    <Link
      href={`/store/${vendor.slug}`}
      className={`${classes} rounded-full bg-zinc-50 px-2 py-1 ring-1 ring-zinc-200 transition hover:bg-white hover:ring-zinc-300`}
    >
      {content}
    </Link>
  );
}
