"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ADMIN_DASHBOARD_HREF } from "@/components/layout/admin-dashboard-link";
import { SignOutButton } from "@/components/auth/sign-out-button";

const ACCOUNT_ITEMS = [
  {
    href: "/profile",
    label: "Profile",
    description: "Details & delivery",
  },
  {
    href: "/account/wallet",
    label: "Wallet",
    description: "USDT & withdrawals",
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

function MenuBody({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Account
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 sm:hidden"
        >
          Close
        </button>
      </div>
      <ul className="py-0.5">
        {ACCOUNT_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              role="menuitem"
              onClick={onClose}
              className="block px-3 py-2 hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="block text-sm font-medium leading-snug text-zinc-950">
                {item.label}
              </span>
              <span className="mt-0.5 block break-words text-[11px] leading-snug text-zinc-500">
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
      <ul className="max-h-[min(40vh,14rem)] overflow-y-auto overscroll-contain py-0.5">
        {WORKSPACE_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              role="menuitem"
              onClick={() => {
                if (item.portal) writeStoredPortal(item.portal);
                onClose();
              }}
              className="block px-3 py-2 hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="block break-words text-sm font-medium leading-snug text-zinc-950">
                {item.label}
              </span>
              <span className="mt-0.5 block break-words text-[11px] leading-snug text-zinc-500">
                {item.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-zinc-100 px-3 py-2">
        <SignOutButton className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50" />
      </div>
    </>
  );
}

/**
 * Account menu — bottom sheet on phones (max-w-xs, portaled to body),
 * compact top-right panel on larger screens.
 */
export function AccountMenuDropdown({
  label = "Account",
  className = "",
}: AccountMenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      // Portaled sheet lives outside rootRef — ignore clicks inside it.
      const sheet = document.getElementById(`${menuId}-sheet`);
      if (sheet?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    const isPhone = window.matchMedia("(max-width: 639px)").matches;
    if (isPhone) {
      document.body.style.overflow = "hidden";
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, menuId]);

  function close() {
    setOpen(false);
  }

  const phoneSheet =
    open && mounted
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Close account menu"
              className="fixed inset-0 z-[80] bg-zinc-950/40 sm:hidden"
              onClick={close}
            />
            <div
              id={`${menuId}-sheet`}
              role="menu"
              className="fixed bottom-0 left-1/2 z-[81] flex w-[min(100%-1.5rem,20rem)] max-w-xs -translate-x-1/2 flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:hidden"
              style={{ maxHeight: "min(70vh, 28rem)" }}
            >
              <div
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-200"
                aria-hidden
              />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <MenuBody onClose={close} />
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 max-w-[7.5rem] items-center gap-1 truncate rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 sm:max-w-none sm:px-3 sm:text-sm"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 hidden w-full max-w-xs overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg sm:block"
        >
          <MenuBody onClose={close} />
        </div>
      ) : null}

      {phoneSheet}
    </div>
  );
}
