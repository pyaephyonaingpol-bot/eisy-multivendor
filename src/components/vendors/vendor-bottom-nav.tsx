"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "@/lib/dom/lock-body-scroll";

type PortalId = "vendor" | "cj";
type TabId =
  | "products"
  | "store"
  | "orders"
  | "wallet"
  | "more"
  | "catalog"
  | "imported";

const PORTAL_STORAGE_KEY = "eisy-seller-portal";

type TabDef = {
  id: TabId;
  href?: string;
  label: string;
};

type MoreLink = {
  href: string;
  label: string;
  description: string;
  portal?: PortalId;
};

const VENDOR_TABS: TabDef[] = [
  { id: "products", href: "/vendor/products", label: "Products" },
  { id: "store", href: "/vendor/settings", label: "Store" },
  { id: "orders", href: "/vendor/orders", label: "Orders" },
  { id: "wallet", href: "/vendor/wallet?portal=vendor", label: "Wallet" },
  { id: "more", label: "More" },
];

const CJ_TABS: TabDef[] = [
  { id: "catalog", href: "/vendor/sourcing", label: "Catalog" },
  { id: "imported", href: "/vendor/dropship/imported", label: "Imported" },
  { id: "orders", href: "/vendor/dropship/orders", label: "Orders" },
  { id: "wallet", href: "/vendor/wallet?portal=cj", label: "Wallet" },
  { id: "more", label: "More" },
];

const VENDOR_MORE_LINKS: MoreLink[] = [
  {
    href: "/vendor/tracking",
    label: "Tracking",
    description: "Shipments for your custom-source orders",
  },
  {
    href: "/vendor/disputes",
    label: "Disputes",
    description: "Open and resolve buyer disputes",
  },
  {
    href: "/vendor/profile?portal=vendor",
    label: "Profile",
    description: "Account details and KYC",
  },
  {
    href: "/vendor/dashboard",
    label: "Overview",
    description: "Store finance and status",
  },
];

const CJ_MORE_LINKS: MoreLink[] = [
  {
    href: "/vendor/dropship/tracking",
    label: "Tracking",
    description: "CJ shipment status and tracking",
  },
  {
    href: "/vendor/dropship/disputes",
    label: "Disputes",
    description: "CJ-related dispute cases",
  },
  {
    href: "/vendor/fees",
    label: "Fees",
    description: "Inventory fees and subscriptions",
  },
  {
    href: "/vendor/integrations",
    label: "Integrations",
    description: "CJ API connection status",
  },
  {
    href: "/vendor/profile?portal=cj",
    label: "Profile",
    description: "Account details and KYC",
  },
  {
    href: "/vendor/dropship",
    label: "Overview",
    description: "CJ finance and subscription",
  },
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
    case "catalog":
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
    case "imported":
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
    case "more":
      return (
        <svg {...common}>
          <circle cx="6.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

function isMoreMenuPath(pathname: string, portal: PortalId) {
  if (portal === "cj") {
    return (
      pathname.startsWith("/vendor/dropship/tracking") ||
      pathname.startsWith("/vendor/dropship/disputes") ||
      pathname.startsWith("/vendor/fees") ||
      pathname.startsWith("/vendor/integrations") ||
      pathname.startsWith("/vendor/import") ||
      pathname.startsWith("/vendor/profile") ||
      pathname.startsWith("/vendor/kyc")
    );
  }
  return (
    pathname === "/vendor/tracking" ||
    pathname === "/vendor/disputes" ||
    pathname.startsWith("/vendor/profile") ||
    pathname.startsWith("/vendor/kyc") ||
    pathname.startsWith("/vendor/support")
  );
}

function resolveActiveTab(pathname: string, portal: PortalId): TabId {
  if (isMoreMenuPath(pathname, portal)) {
    return "more";
  }

  if (pathname.startsWith("/vendor/wallet")) {
    return "wallet";
  }

  if (portal === "cj") {
    if (pathname.startsWith("/vendor/dropship/orders")) {
      return "orders";
    }
    if (pathname.startsWith("/vendor/dropship/imported")) {
      return "imported";
    }
    if (
      pathname.startsWith("/vendor/sourcing") ||
      pathname.startsWith("/vendor/dropship")
    ) {
      return "catalog";
    }
    return "catalog";
  }

  if (
    pathname === "/vendor/orders" ||
    pathname.startsWith("/vendor/orders/")
  ) {
    return "orders";
  }
  if (pathname.startsWith("/vendor/settings")) {
    return "store";
  }
  if (
    pathname.startsWith("/vendor/products") ||
    pathname === "/vendor/dashboard"
  ) {
    return "products";
  }
  return "products";
}

function moreLinkActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0] || href;
  if (pathname === hrefPath) return true;
  if (hrefPath !== "/" && pathname.startsWith(`${hrefPath}/`)) return true;
  return false;
}

/**
 * Fixed bottom tab bar for seller portals (Independent Vendor + CJ).
 * Primary tabs stay in the bar; More opens a drawer for Tracking, Disputes,
 * profile, fees, and portal switching.
 */
export function VendorBottomNav() {
  const pathname = usePathname() || "/vendor/dashboard";
  const searchParams = useSearchParams();
  const searchPortal = searchParams.get("portal");
  const urlPortal = portalFromUrl(pathname, searchPortal);
  const [portal, setPortal] = useState<PortalId>(urlPortal);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname, searchPortal]);

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    const unlock = lockBodyScroll();
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const tabs = portal === "cj" ? CJ_TABS : VENDOR_TABS;
  const moreLinks = portal === "cj" ? CJ_MORE_LINKS : VENDOR_MORE_LINKS;
  const activeId = resolveActiveTab(pathname, portal);
  const inCj = portal === "cj";
  const accentClass = inCj ? "text-sky-700" : "text-zinc-950";
  const mutedClass = inCj
    ? "text-sky-900/55 hover:text-sky-900"
    : "text-zinc-500 hover:text-zinc-900";

  const moreSheet =
    moreOpen && mounted
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Close more menu"
              className="fixed inset-0 z-[80] box-border w-full max-w-full bg-zinc-950/40"
              onClick={() => setMoreOpen(false)}
            />
            <div
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label={
                inCj
                  ? "CJ Dropshipping more menu"
                  : "Independent Vendor more menu"
              }
              className={`fixed bottom-0 left-1/2 z-[81] box-border flex w-[min(100%-1.5rem,20rem)] max-w-xs -translate-x-1/2 flex-col overflow-hidden rounded-t-2xl border bg-white shadow-2xl sm:max-w-sm ${
                inCj ? "border-sky-200" : "border-zinc-200"
              }`}
              style={{ maxHeight: "min(70vh, 28rem)" }}
            >
              <div
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-200"
                aria-hidden
              />
              <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950">More</p>
                  <p
                    className={`break-words text-xs ${inCj ? "text-sky-800" : "text-zinc-500"}`}
                  >
                    {inCj ? "CJ Dropshipping" : "Independent Vendor"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
                >
                  Close
                </button>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
                {moreLinks.map((item) => {
                  const active = moreLinkActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          writeStoredPortal(item.portal ?? portal);
                          setMoreOpen(false);
                        }}
                        aria-current={active ? "page" : undefined}
                        className={`block px-3 py-2.5 transition hover:bg-zinc-50 ${
                          active
                            ? inCj
                              ? "bg-sky-50"
                              : "bg-zinc-50"
                            : ""
                        }`}
                      >
                        <span className="block break-words text-sm font-medium text-zinc-950">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-zinc-500">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      {moreSheet}

      <nav
        aria-label={
          inCj
            ? "CJ Dropshipping quick navigation"
            : "Independent Vendor quick navigation"
        }
        data-portal={portal}
        className={`fixed-shell fixed bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md ${
          inCj
            ? "border-sky-200 bg-white/95"
            : "border-zinc-200 bg-white/95"
        }`}
      >
        <ul className="mx-auto grid h-16 max-w-6xl grid-cols-5 px-1">
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            if (tab.id === "more") {
              return (
                <li key={`${portal}-more`} className="flex">
                  <button
                    type="button"
                    aria-expanded={moreOpen}
                    aria-controls={panelId}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen((value) => !value)}
                    className={`flex w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
                      active || moreOpen ? accentClass : mutedClass
                    }`}
                  >
                    <TabIcon id="more" />
                    More
                  </button>
                </li>
              );
            }

            return (
              <li key={`${portal}-${tab.id}`} className="flex">
                <Link
                  href={tab.href!}
                  onClick={() => {
                    writeStoredPortal(portal);
                    setMoreOpen(false);
                  }}
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
    </>
  );
}
