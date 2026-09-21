"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type PortalId = "vendor" | "cj";
type TabId = "products" | "store" | "orders" | "wallet" | "profile";

const PORTAL_STORAGE_KEY = "eisy-seller-portal";

type TabDef = {
  id: TabId;
  href: string;
  label: string;
};

const VENDOR_TABS: TabDef[] = [
  { id: "products", href: "/vendor/products", label: "Products" },
  { id: "store", href: "/vendor/settings", label: "Store" },
  { id: "orders", href: "/vendor/orders", label: "Orders" },
  { id: "wallet", href: "/vendor/wallet?portal=vendor", label: "Wallet" },
  { id: "profile", href: "/vendor/profile?portal=vendor", label: "Profile" },
];

const CJ_TABS: TabDef[] = [
  { id: "products", href: "/vendor/sourcing", label: "Catalog" },
  { id: "store", href: "/vendor/dropship/imported", label: "Imported" },
  { id: "orders", href: "/vendor/dropship/orders", label: "Orders" },
  { id: "wallet", href: "/vendor/wallet?portal=cj", label: "Wallet" },
  { id: "profile", href: "/vendor/profile?portal=cj", label: "Profile" },
];

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

function TabIcon({ id }: { id: TabId }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    className: "h-5 w-5",
    "aria-hidden": true as const,
  };

  switch (id) {
    case "products":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 7.5h16M4 12h16M4 16.5h10"
          />
        </svg>
      );
    case "store":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 9.5 5.5 5h13L20 9.5v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1Zm2 4v5.5h12V13.5"
          />
        </svg>
      );
    case "orders":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 4.75h10a1.5 1.5 0 0 1 1.5 1.5v12.5l-3-1.5-3 1.5-3-1.5-3 1.5V6.25a1.5 1.5 0 0 1 1.5-1.5Z"
          />
          <path strokeLinecap="round" d="M9 9h6M9 12.5h6" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 7.5h15A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.5h-3.25a1.75 1.75 0 0 0 0 3.5H21M3 9.25h18"
          />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.75c-3.4 0-6.25 1.7-6.25 3.75V19h12.5v-1.5c0-2.05-2.85-3.75-6.25-3.75Z"
          />
        </svg>
      );
  }
}

function resolveActiveTab(pathname: string, portal: PortalId): TabId {
  if (
    pathname.startsWith("/vendor/profile") ||
    pathname.startsWith("/vendor/kyc")
  ) {
    return "profile";
  }
  if (pathname.startsWith("/vendor/wallet")) {
    return "wallet";
  }

  if (portal === "cj") {
    if (
      pathname.startsWith("/vendor/dropship/orders") ||
      pathname.startsWith("/vendor/dropship/tracking") ||
      pathname.startsWith("/vendor/dropship/disputes")
    ) {
      return "orders";
    }
    if (pathname.startsWith("/vendor/dropship/imported")) {
      return "store";
    }
    if (
      pathname.startsWith("/vendor/sourcing") ||
      pathname.startsWith("/vendor/dropship") ||
      pathname.startsWith("/vendor/import") ||
      pathname.startsWith("/vendor/integrations") ||
      pathname.startsWith("/vendor/fees")
    ) {
      return "products";
    }
    return "products";
  }

  if (
    pathname === "/vendor/orders" ||
    pathname.startsWith("/vendor/orders/") ||
    pathname === "/vendor/tracking" ||
    pathname === "/vendor/disputes"
  ) {
    return "orders";
  }
  if (pathname.startsWith("/vendor/settings")) {
    return "store";
  }
  if (pathname.startsWith("/vendor/products") || pathname === "/vendor/dashboard") {
    return "products";
  }
  return "products";
}

/**
 * Fixed bottom tab bar for seller portals (Independent Vendor + CJ).
 * Mirrors the buyer marketplace bottom nav for quick one-tap access.
 */
export function VendorBottomNav() {
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

  const tabs = portal === "cj" ? CJ_TABS : VENDOR_TABS;
  const activeId = resolveActiveTab(pathname, portal);
  const accentClass =
    portal === "cj"
      ? "text-sky-700"
      : "text-zinc-950";
  const mutedClass =
    portal === "cj"
      ? "text-sky-900/55 hover:text-sky-900"
      : "text-zinc-500 hover:text-zinc-900";

  return (
    <nav
      aria-label={
        portal === "cj"
          ? "CJ Dropshipping quick navigation"
          : "Independent Vendor quick navigation"
      }
      data-portal={portal}
      className={`fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md ${
        portal === "cj"
          ? "border-sky-200 bg-white/95"
          : "border-zinc-200 bg-white/95"
      }`}
    >
      <ul className="mx-auto grid h-16 max-w-6xl grid-cols-5 px-1">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <li key={`${portal}-${tab.id}`} className="flex">
              <Link
                href={tab.href}
                onClick={() => writeStoredPortal(portal)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                  active ? accentClass : mutedClass
                }`}
              >
                <TabIcon id={tab.id} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
