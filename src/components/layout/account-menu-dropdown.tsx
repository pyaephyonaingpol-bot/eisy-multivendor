"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ADMIN_DASHBOARD_HREF } from "@/components/layout/admin-dashboard-link";
import { SignOutButton } from "@/components/auth/sign-out-button";

const ACCOUNT_ITEMS = [
  {
    href: "/profile",
    label: "Profile",
    description: "Details & delivery addresses",
  },
  {
    href: "/account/wallet",
    label: "Wallet",
    description: "USDT balance & withdrawals",
  },
] as const;

const WORKSPACE_ITEMS = [
  {
    href: "/",
    label: "Buyer Marketplace",
    description: "Shop and checkout",
    portal: null,
  },
  {
    href: "/vendor/dashboard",
    label: "Independent Vendor",
    description: "Manual store ops",
    portal: "vendor" as const,
  },
  {
    href: "/vendor/dropship",
    label: "CJ Dropshipping",
    description: "Catalog & fulfillment",
    portal: "cj" as const,
  },
  {
    href: ADMIN_DASHBOARD_HREF,
    label: "Admin",
    description: "Platform dashboard",
    portal: null,
  },
] as const;

const PORTAL_STORAGE_KEY = "eisy-seller-portal";

function writeStoredPortal(portal: "vendor" | "cj") {
  try {
    window.localStorage.setItem(PORTAL_STORAGE_KEY, portal);
  } catch {
    // ignore
  }
}

type AccountMenuDropdownProps = {
  label?: string;
  className?: string;
};

/**
 * Header Account menu — the only place to switch workspaces.
 */
export function AccountMenuDropdown({
  label = "Account",
  className = "",
}: AccountMenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        {label}
        <span aria-hidden className="text-[10px] text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(18.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        >
          <div className="border-b border-zinc-100 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Account
            </p>
          </div>
          <ul className="py-1">
            {ACCOUNT_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2.5 hover:bg-zinc-50"
                >
                  <span className="block text-sm font-medium text-zinc-950">
                    {item.label}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-y border-zinc-100 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Workspaces
            </p>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto py-1">
            {WORKSPACE_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => {
                    if (item.portal) writeStoredPortal(item.portal);
                    setOpen(false);
                  }}
                  className="block px-3 py-2.5 hover:bg-zinc-50"
                >
                  <span className="block text-sm font-medium text-zinc-950">
                    {item.label}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-100 px-3 py-2">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
