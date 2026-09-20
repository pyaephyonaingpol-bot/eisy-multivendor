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
  backLabel: string;
};

function linkIsActive(pathname: string, href: string) {
  if (pathname === href) return true;
  // Avoid treating /vendor/profile as active for /vendor/profile/email etc. when
  // a more specific profile child link exists — still highlight parent prefixes
  // for nested product/edit and dropship child routes.
  if (href !== "/vendor/dashboard" && pathname.startsWith(`${href}/`)) {
    return true;
  }
  return false;
}

function NavSection({
  title,
  links,
  pathname,
  accent,
  nested = false,
}: {
  title: string;
  links: VendorNavLink[];
  pathname: string;
  accent: "vendor" | "profile" | "dropship";
  nested?: boolean;
}) {
  const headingClass =
    accent === "dropship"
      ? "text-sky-800/80"
      : accent === "profile"
        ? "text-zinc-400"
        : "text-zinc-500";

  return (
    <div className={nested ? "space-y-1.5 pl-0 md:pl-1" : "space-y-2"}>
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
                    : nested
                      ? "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 md:bg-transparent md:text-zinc-600"
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
 * Vendor portal nav: Vendor ops, Profile/settings sublinks, Dropshipper workspace.
 */
export function VendorPortalNav({
  vendorTitle,
  profileTitle,
  dropshipTitle,
  vendorLinks,
  profileLinks,
  dropshipLinks,
  backLabel,
}: Props) {
  const pathname = usePathname() || "/vendor/dashboard";
  const inDropship =
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees") ||
    dropshipLinks.some((link) => linkIsActive(pathname, link.href));
  const inProfile =
    pathname.startsWith("/vendor/profile") ||
    pathname.startsWith("/vendor/kyc") ||
    pathname.startsWith("/vendor/wallet") ||
    pathname.startsWith("/vendor/apply");

  return (
    <nav
      className="-mx-1 space-y-4 overflow-x-auto px-1 pb-1 text-sm [scrollbar-width:none] md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Seller portal"
    >
      <div
        className={`space-y-3 rounded-xl border p-2 md:border-0 md:p-0 ${
          inDropship
            ? "border-zinc-200 bg-white/80 md:bg-transparent"
            : "border-zinc-300 bg-zinc-50/80 md:bg-transparent"
        }`}
      >
        <NavSection
          title={vendorTitle}
          links={vendorLinks}
          pathname={pathname}
          accent="vendor"
        />
        <div
          className={`rounded-lg border border-dashed p-2 md:border-0 md:bg-transparent md:p-0 ${
            inProfile
              ? "border-zinc-300 bg-white/90"
              : "border-zinc-200 bg-white/50"
          }`}
        >
          <NavSection
            title={profileTitle}
            links={profileLinks}
            pathname={pathname}
            accent="profile"
            nested
          />
        </div>
      </div>

      <div
        className={`rounded-xl border p-2 md:border-0 md:bg-transparent md:p-0 ${
          inDropship
            ? "border-sky-200 bg-sky-50/70"
            : "border-sky-100 bg-sky-50/40"
        }`}
      >
        <NavSection
          title={dropshipTitle}
          links={dropshipLinks}
          pathname={pathname}
          accent="dropship"
        />
      </div>

      <Link
        href="/"
        className="inline-flex whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-400 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-2"
      >
        {backLabel}
      </Link>
    </nav>
  );
}
