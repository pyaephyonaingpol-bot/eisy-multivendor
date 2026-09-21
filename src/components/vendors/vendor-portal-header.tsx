"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenuDropdown } from "@/components/layout/account-menu-dropdown";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

type PortalId = "vendor" | "cj";

const PORTAL_STORAGE_KEY = "eisy-seller-portal";

function isCjExclusivePath(pathname: string) {
  return (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees")
  );
}

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
  return "vendor";
}

/**
 * Compact top header for seller portals — brand, active portal, account.
 * Primary navigation lives in the fixed bottom bar.
 */
export function VendorPortalHeader() {
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
      if (stored) setPortal(stored);
    }
  }, [pathname, searchPortal]);

  const inCj = portal === "cj";
  const homeHref = inCj ? "/vendor/dropship" : "/vendor/dashboard";
  const portalLabel = inCj ? "CJ Dropshipping" : "Independent Vendor";
  const switchHref = inCj ? "/vendor/dashboard" : "/vendor/dropship";
  const switchLabel = inCj ? "Vendor portal" : "CJ portal";

  return (
    <header
      data-portal={portal}
      className={`sticky top-0 z-40 border-b backdrop-blur-md ${
        inCj
          ? "border-sky-200/80 bg-white/95"
          : "border-zinc-200/80 bg-white/95"
      }`}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <Link
            href={homeHref}
            onClick={() => writeStoredPortal(portal)}
            className="block truncate text-sm font-semibold tracking-tight text-zinc-950"
          >
            EISY Seller
          </Link>
          <p
            className={`truncate text-[11px] font-medium ${
              inCj ? "text-sky-800" : "text-zinc-500"
            }`}
          >
            {portalLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={switchHref}
            onClick={() => writeStoredPortal(inCj ? "vendor" : "cj")}
            className={`hidden rounded-full border px-2.5 py-1.5 text-xs font-medium transition sm:inline-flex ${
              inCj
                ? "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
                : "border-sky-200 text-sky-900 hover:border-sky-300 hover:bg-sky-50"
            }`}
          >
            {switchLabel}
          </Link>
          <LanguageSwitcher compact />
          <AccountMenuDropdown label="Account" />
        </div>
      </div>
    </header>
  );
}
