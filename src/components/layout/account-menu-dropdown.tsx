"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ADMIN_DASHBOARD_HREF,
} from "@/components/layout/admin-dashboard-link";
import { SignOutButton } from "@/components/auth/sign-out-button";

const MENU_ITEMS = [
  {
    href: "/profile",
    label: "Profile",
    description: "Personal details & addresses",
  },
  {
    href: "/account/wallet",
    label: "Wallet",
    description: "USDT balance & withdrawals",
  },
  {
    href: "/",
    label: "Buyer Marketplace",
    description: "Shop as a buyer",
  },
  {
    href: "/vendor/dashboard",
    label: "Independent Vendor",
    description: "Manual store portal",
  },
  {
    href: "/vendor/dropship",
    label: "CJ Dropshipping",
    description: "CJ catalog & fulfillment",
  },
  {
    href: ADMIN_DASHBOARD_HREF,
    label: "Admin",
    description: "Platform dashboard",
  },
] as const;

type AccountMenuDropdownProps = {
  label?: string;
  className?: string;
};

/**
 * Compact header Account menu with Profile, Wallet, and portal switches.
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
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--market-line)] bg-white px-3 text-sm font-medium text-[var(--market-ink)] hover:bg-[var(--background)]"
      >
        {label}
        <span aria-hidden className="text-[10px] text-[var(--market-muted)]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        >
          <div className="border-b border-zinc-100 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Account
            </p>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto py-1">
            {MENU_ITEMS.map((item) => (
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
          <div className="border-t border-zinc-100 px-3 py-2">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
