"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type VendorNavLink = {
  href: string;
  label: string;
};

type Props = {
  vendorTitle: string;
  dropshipTitle: string;
  vendorLinks: VendorNavLink[];
  dropshipLinks: VendorNavLink[];
  vendorHomeHref?: string;
  dropshipHomeHref?: string;
  accountHref?: string;
  accountLabel?: string;
  backLabel: string;
};

function linkIsActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0] || href;
  if (pathname === hrefPath) return true;
  if (hrefPath !== "/vendor/dashboard" && pathname.startsWith(`${hrefPath}/`)) {
    return true;
  }
  return false;
}

function isCjPortalPath(pathname: string) {
  return (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees")
  );
}

function NavSection({
  title,
  links,
  pathname,
  accent,
}: {
  title: string;
  links: VendorNavLink[];
  pathname: string;
  accent: "vendor" | "dropship";
}) {
  return (
    <div className="space-y-2">
      <p
        className={`px-1 text-[11px] font-semibold uppercase tracking-wider md:px-0 ${
          accent === "dropship" ? "text-sky-800/80" : "text-zinc-500"
        }`}
      >
        {title}
      </p>
      <div className="flex gap-2 overflow-visible md:flex-col md:gap-1">
        {links.map((item) => {
          const active = linkIsActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition md:rounded-md md:border-0 md:px-2 md:py-1.5 ${
                active
                  ? accent === "dropship"
                    ? "border-sky-300 bg-sky-50 font-medium text-sky-950 md:bg-sky-50"
                    : "border-zinc-900 bg-zinc-950 font-medium text-white md:bg-zinc-100 md:text-zinc-950"
                  : accent === "dropship"
                    ? "border-sky-100 bg-sky-50/40 text-sky-900/80 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-950 md:bg-transparent"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 md:bg-transparent"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Two fully independent portals — only one sidebar menu is visible at a time.
 * Independent Vendor and CJ Dropshipping never share nav items.
 */
export function VendorPortalNav({
  vendorTitle,
  dropshipTitle,
  vendorLinks,
  dropshipLinks,
  vendorHomeHref = "/vendor/dashboard",
  dropshipHomeHref = "/vendor/dropship",
  accountHref = "/vendor/profile",
  accountLabel = "Account",
  backLabel,
}: Props) {
  const pathname = usePathname() || "/vendor/dashboard";
  const inCjPortal = isCjPortalPath(pathname);

  return (
    <nav
      className="-mx-1 space-y-4 overflow-x-auto px-1 pb-1 text-sm [scrollbar-width:none] md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
      aria-label={
        inCjPortal ? "CJ Dropshipping Portal" : "Independent Vendor Portal"
      }
    >
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1"
        role="tablist"
        aria-label="Seller portals"
      >
        <Link
          href={vendorHomeHref}
          role="tab"
          aria-selected={!inCjPortal}
          className={`rounded-lg px-2 py-2 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
            !inCjPortal
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {vendorTitle}
        </Link>
        <Link
          href={dropshipHomeHref}
          role="tab"
          aria-selected={inCjPortal}
          className={`rounded-lg px-2 py-2 text-center text-[11px] font-semibold leading-tight transition sm:text-xs ${
            inCjPortal
              ? "bg-sky-50 text-sky-950 shadow-sm ring-1 ring-sky-200"
              : "text-zinc-500 hover:text-sky-900"
          }`}
        >
          {dropshipTitle}
        </Link>
      </div>

      {inCjPortal ? (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 md:border-sky-100 md:bg-sky-50/40">
          <NavSection
            title={dropshipTitle}
            links={dropshipLinks}
            pathname={pathname}
            accent="dropship"
          />
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-zinc-300 bg-zinc-50/90 p-2.5 md:border-zinc-200 md:bg-zinc-50/60">
          <NavSection
            title={vendorTitle}
            links={vendorLinks}
            pathname={pathname}
            accent="vendor"
          />
        </div>
      )}

      <div className="space-y-2 border-t border-zinc-200 pt-3 md:pt-2">
        <Link
          href={accountHref}
          className="inline-flex whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-500 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0"
        >
          {accountLabel}
        </Link>
        <Link
          href="/"
          className="block whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-400 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0"
        >
          {backLabel}
        </Link>
      </div>
    </nav>
  );
}
