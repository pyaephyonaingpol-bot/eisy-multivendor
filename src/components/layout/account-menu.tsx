"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ADMIN_DASHBOARD_HREF,
  AdminDashboardLink,
} from "@/components/layout/admin-dashboard-link";

export type AccountMenuActive =
  | "profile"
  | "wallet"
  | "buyer"
  | "vendor"
  | "cj"
  | "admin";

const ACCOUNT_LINKS = [
  {
    id: "profile" as const,
    href: "/profile",
    label: "Profile",
    description: "Name, email, phone, and delivery details",
  },
  {
    id: "wallet" as const,
    href: "/account/wallet",
    label: "Wallet",
    description: "USDT balance, deposits, and withdrawals",
  },
] as const;

const PORTAL_LINKS = [
  {
    id: "buyer" as const,
    href: "/",
    label: "Buyer Marketplace",
    description: "Shop products and check out in USDT",
  },
  {
    id: "vendor" as const,
    href: "/vendor/dashboard",
    label: "Independent Vendor",
    description: "Manual store listings and orders",
  },
  {
    id: "cj" as const,
    href: "/vendor/dropship",
    label: "CJ Dropshipping",
    description: "CJ catalog, imports, and fulfillment",
  },
] as const;

function resolveActive(
  pathname: string,
  searchPortal: string | null,
): AccountMenuActive | undefined {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/profile") || pathname.startsWith("/vendor/profile")) {
    return "profile";
  }
  if (
    pathname.startsWith("/account/wallet") ||
    pathname.startsWith("/vendor/wallet")
  ) {
    return "wallet";
  }
  if (
    pathname.startsWith("/vendor/dropship") ||
    pathname.startsWith("/vendor/sourcing") ||
    pathname.startsWith("/vendor/import") ||
    pathname.startsWith("/vendor/integrations") ||
    pathname.startsWith("/vendor/fees") ||
    searchPortal === "cj"
  ) {
    return "cj";
  }
  if (pathname.startsWith("/vendor")) return "vendor";
  if (
    pathname === "/" ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/store")
  ) {
    return "buyer";
  }
  return undefined;
}

function MenuCard({
  href,
  label,
  description,
  active,
}: {
  href: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border px-3 py-2.5 transition ${
        active
          ? "border-zinc-900 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span
        className={`mt-0.5 block text-xs ${
          active ? "text-zinc-300" : "text-zinc-500"
        }`}
      >
        {description}
      </span>
    </Link>
  );
}

type AccountMenuProps = {
  /** Override auto-detected active item. */
  active?: AccountMenuActive;
  className?: string;
  /** Compact title for embedding in profile/header panels. */
  title?: string;
};

/**
 * Unified Account menu: Profile + Wallet + portal switching
 * (Buyer, Independent Vendor, CJ Dropshipping, Admin).
 */
export function AccountMenu({
  active: activeOverride,
  className,
  title = "Account",
}: AccountMenuProps) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const active =
    activeOverride ?? resolveActive(pathname, searchParams.get("portal"));

  return (
    <nav
      className={className}
      aria-label="Account, wallet, and portals"
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
        <p className="text-xs text-zinc-500">
          Manage your profile, wallet, and switch between buyer and seller
          portals.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Your account
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.id}>
                <MenuCard
                  href={link.href}
                  label={link.label}
                  description={link.description}
                  active={active === link.id}
                />
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Switch portal
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PORTAL_LINKS.map((link) => (
              <li key={link.id}>
                <MenuCard
                  href={link.href}
                  label={link.label}
                  description={link.description}
                  active={active === link.id}
                />
              </li>
            ))}
            <li>
              <AdminDashboardLink
                className={`block rounded-xl border px-3 py-2.5 transition ${
                  active === "admin"
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                <span className="block text-sm font-medium">Admin</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    active === "admin" ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  Platform ops, fees, and moderation
                </span>
              </AdminDashboardLink>
            </li>
          </ul>
        </div>
      </div>

      {/* Keep a stable admin href exported for tests / deep links */}
      <span className="sr-only">{ADMIN_DASHBOARD_HREF}</span>
    </nav>
  );
}
