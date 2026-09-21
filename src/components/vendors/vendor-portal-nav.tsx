"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type VendorNavLink = {
  href: string;
  label: string;
};

type Props = {
  vendorTitle: string;
  profileTitle: string;
  dropshipTitle: string;
  vendorLinks: VendorNavLink[];
  profileLinks: VendorNavLink[];
  dropshipLinks: VendorNavLink[];
  vendorHomeHref?: string;
  dropshipHomeHref?: string;
  switchToVendorLabel?: string;
  switchToDropshipLabel?: string;
  backLabel: string;
};

function linkIsActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0] || href;
  if (pathname === hrefPath) return true;
  if (hrefPath !== "/vendor/dashboard" && pathname.startsWith(`${hrefPath}/`)) {
    return true;
  }
  // Query-scoped support links (channel=manual|cj)
  if (href.includes("?")) {
    return false;
  }
  return false;
}

function isDropshipPath(pathname: string, dropshipLinks: VendorNavLink[]) {
  if (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees")
  ) {
    return true;
  }
  return dropshipLinks.some((link) => {
    const path = link.href.split("?")[0] || link.href;
    return pathname === path || pathname.startsWith(`${path}/`);
  });
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
  accent: "vendor" | "profile" | "dropship";
}) {
  const headingClass =
    accent === "dropship"
      ? "text-sky-800/80"
      : accent === "profile"
        ? "text-zinc-400"
        : "text-zinc-500";

  return (
    <div className="space-y-2">
      <p
        className={`px-1 text-[11px] font-semibold uppercase tracking-wider md:px-0 ${headingClass}`}
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
 * Seller portal nav — shows either Vendor or Dropshipper workspace menus,
 * never both at once, so Product/Orders/Tracking never overlap with
 * Dropshipper Orders/Catalog/Imported products.
 */
export function VendorPortalNav({
  vendorTitle,
  profileTitle,
  dropshipTitle,
  vendorLinks,
  profileLinks,
  dropshipLinks,
  vendorHomeHref = "/vendor/dashboard",
  dropshipHomeHref = "/vendor/dropship",
  switchToVendorLabel = "← Vendor management",
  switchToDropshipLabel = "Dropshipper workspace →",
  backLabel,
}: Props) {
  const pathname = usePathname() || "/vendor/dashboard";
  const inDropship = isDropshipPath(pathname, dropshipLinks);

  return (
    <nav
      className="-mx-1 space-y-4 overflow-x-auto px-1 pb-1 text-sm [scrollbar-width:none] md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
      aria-label={inDropship ? "Dropshipper management" : "Vendor management"}
    >
      {/* Workspace switcher — exclusive modes */}
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1"
        role="tablist"
        aria-label="Seller workspace"
      >
        <Link
          href={vendorHomeHref}
          role="tab"
          aria-selected={!inDropship}
          className={`rounded-lg px-2 py-2 text-center text-xs font-semibold transition sm:text-sm ${
            !inDropship
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {vendorTitle}
        </Link>
        <Link
          href={dropshipHomeHref}
          role="tab"
          aria-selected={inDropship}
          className={`rounded-lg px-2 py-2 text-center text-xs font-semibold transition sm:text-sm ${
            inDropship
              ? "bg-sky-50 text-sky-950 shadow-sm ring-1 ring-sky-200"
              : "text-zinc-500 hover:text-sky-900"
          }`}
        >
          {dropshipTitle}
        </Link>
      </div>

      {inDropship ? (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-2 md:border-0 md:bg-transparent md:p-0">
          <NavSection
            title={dropshipTitle}
            links={dropshipLinks}
            pathname={pathname}
            accent="dropship"
          />
          <Link
            href={vendorHomeHref}
            className="inline-flex text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline md:px-1"
          >
            {switchToVendorLabel}
          </Link>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 md:border-0 md:bg-transparent md:p-0">
          <NavSection
            title={vendorTitle}
            links={vendorLinks}
            pathname={pathname}
            accent="vendor"
          />
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 p-2 md:border-0 md:bg-transparent md:p-0">
            <NavSection
              title={profileTitle}
              links={profileLinks}
              pathname={pathname}
              accent="profile"
            />
          </div>
          <Link
            href={dropshipHomeHref}
            className="inline-flex text-xs font-medium text-sky-800 underline-offset-2 hover:underline md:px-1"
          >
            {switchToDropshipLabel}
          </Link>
        </div>
      )}

      <Link
        href="/"
        className="inline-flex whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-400 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-2"
      >
        {backLabel}
      </Link>
    </nav>
  );
}
