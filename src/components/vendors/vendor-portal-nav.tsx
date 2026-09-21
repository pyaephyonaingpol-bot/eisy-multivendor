"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export type VendorNavLink = {
  href: string;
  label: string;
};

type PortalId = "vendor" | "cj";

const PORTAL_STORAGE_KEY = "eisy-seller-portal";

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

/** Routes that belong exclusively to the CJ Dropshipping portal. */
function isCjExclusivePath(pathname: string) {
  return (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees")
  );
}

/** Routes that belong exclusively to the Independent Vendor portal. */
function isVendorExclusivePath(pathname: string) {
  return (
    pathname === "/vendor/dashboard" ||
    pathname.startsWith("/vendor/products") ||
    pathname.startsWith("/vendor/settings") ||
    pathname === "/vendor/orders" ||
    pathname.startsWith("/vendor/orders/") ||
    pathname === "/vendor/tracking" ||
    pathname === "/vendor/disputes" ||
    pathname.startsWith("/vendor/apply")
  );
}

function isSharedPath(pathname: string) {
  return (
    pathname.startsWith("/vendor/wallet") ||
    pathname.startsWith("/vendor/profile") ||
    pathname.startsWith("/vendor/kyc") ||
    pathname.startsWith("/vendor/support")
  );
}

function readStoredPortal(): PortalId | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(PORTAL_STORAGE_KEY);
    if (value === "cj" || value === "vendor") return value;
  } catch {
    // ignore
  }
  return null;
}

function writeStoredPortal(portal: PortalId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PORTAL_STORAGE_KEY, portal);
  } catch {
    // ignore
  }
}

function portalFromUrl(
  pathname: string,
  searchPortal: string | null,
): PortalId {
  if (searchPortal === "cj" || searchPortal === "vendor") return searchPortal;
  if (isCjExclusivePath(pathname)) return "cj";
  if (isVendorExclusivePath(pathname)) return "vendor";
  // Shared routes default to vendor for SSR/client first paint parity.
  return "vendor";
}

/**
 * Strict portal isolation: only one portal’s menus render at a time.
 * Shared pages (wallet, profile) keep the selected portal via ?portal=
 * and localStorage — both menus are never shown together.
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
  const searchParams = useSearchParams();
  const searchPortal = searchParams.get("portal");
  const urlPortal = portalFromUrl(pathname, searchPortal);

  const [portal, setPortal] = useState<PortalId>(urlPortal);

  useEffect(() => {
    if (searchPortal === "cj" || searchPortal === "vendor") {
      setPortal(searchPortal);
      writeStoredPortal(searchPortal);
      return;
    }
    if (isCjExclusivePath(pathname)) {
      setPortal("cj");
      writeStoredPortal("cj");
      return;
    }
    if (isVendorExclusivePath(pathname)) {
      setPortal("vendor");
      writeStoredPortal("vendor");
      return;
    }
    if (isSharedPath(pathname)) {
      const stored = readStoredPortal();
      if (stored) {
        setPortal(stored);
      }
    }
  }, [pathname, searchPortal]);

  const inCj = portal === "cj";
  const title = inCj ? dropshipTitle : vendorTitle;
  const links = inCj ? dropshipLinks : vendorLinks;
  const switchHref = inCj ? vendorHomeHref : dropshipHomeHref;
  const switchLabel = inCj
    ? `Switch to ${vendorTitle}`
    : `Switch to ${dropshipTitle}`;

  return (
    <nav
      className="space-y-4 text-sm"
      aria-label={inCj ? "CJ Dropshipping Portal" : "Independent Vendor Portal"}
      data-portal={portal}
    >
      <div
        className={`rounded-xl border px-3 py-2.5 ${
          inCj
            ? "border-sky-200 bg-sky-50 text-sky-950"
            : "border-zinc-200 bg-zinc-50 text-zinc-950"
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
          Active portal
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-snug">{title}</p>
      </div>

      <div
        className={`space-y-1 rounded-xl border p-2 ${
          inCj
            ? "border-sky-200 bg-sky-50/60"
            : "border-zinc-200 bg-zinc-50/80"
        }`}
      >
        <div className="flex flex-col gap-0.5">
          {links.map((item) => {
            const active = linkIsActive(pathname, item.href);
            return (
              <Link
                key={`${portal}-${item.href}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => writeStoredPortal(portal)}
                className={`rounded-lg px-2.5 py-2 text-sm transition ${
                  active
                    ? inCj
                      ? "bg-sky-600 font-medium text-white"
                      : "bg-zinc-950 font-medium text-white"
                    : inCj
                      ? "text-sky-950/80 hover:bg-sky-100 hover:text-sky-950"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-950"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Link
        href={switchHref}
        onClick={() => writeStoredPortal(inCj ? "vendor" : "cj")}
        className={`block rounded-lg border px-2.5 py-2 text-center text-xs font-medium transition ${
          inCj
            ? "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
            : "border-sky-200 bg-sky-50/50 text-sky-900 hover:border-sky-300 hover:bg-sky-50"
        }`}
      >
        {switchLabel}
      </Link>

      <div className="space-y-1 border-t border-zinc-200 pt-3">
        <Link
          href={`${accountHref}?portal=${portal}`}
          onClick={() => writeStoredPortal(portal)}
          className="block rounded-lg px-2.5 py-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950"
        >
          {accountLabel}
        </Link>
        <Link
          href="/"
          className="block rounded-lg px-2.5 py-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"
        >
          {backLabel}
        </Link>
      </div>
    </nav>
  );
}
