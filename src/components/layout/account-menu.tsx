"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ADMIN_DASHBOARD_HREF } from "@/components/layout/admin-dashboard-link";

export type AccountMenuActive = "profile" | "wallet";

const ACCOUNT_LINKS = [
  {
    id: "profile" as const,
    href: "/profile",
    label: "Profile",
  },
  {
    id: "wallet" as const,
    href: "/account/wallet",
    label: "Wallet",
  },
] as const;

function resolveActive(pathname: string): AccountMenuActive | undefined {
  if (pathname.startsWith("/profile") || pathname.startsWith("/vendor/profile")) {
    return "profile";
  }
  if (
    pathname.startsWith("/account/wallet") ||
    pathname.startsWith("/vendor/wallet")
  ) {
    return "wallet";
  }
  return undefined;
}

type AccountMenuProps = {
  /** Override auto-detected active item. */
  active?: AccountMenuActive;
  className?: string;
  title?: string;
};

/**
 * Compact account section links (Profile / Wallet).
 * Portal switching belongs in the header Account dropdown — not here.
 */
export function AccountMenu({
  active: activeOverride,
  className,
  title = "Account",
}: AccountMenuProps) {
  const pathname = usePathname() || "/";
  useSearchParams(); // keep suspense boundary parity with callers
  const active = activeOverride ?? resolveActive(pathname);

  return (
    <nav className={className} aria-label="Account sections">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ACCOUNT_LINKS.map((link) => {
          const isActive = active === link.id;
          return (
            <li key={link.id}>
              <Link
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-zinc-950 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <span className="sr-only">{ADMIN_DASHBOARD_HREF}</span>
    </nav>
  );
}
