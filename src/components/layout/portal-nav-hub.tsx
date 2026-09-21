import Link from "next/link";
import { AdminDashboardLink } from "@/components/layout/admin-dashboard-link";

export const PORTAL_HUB_LINKS = [
  {
    href: "/",
    label: "Buyer Marketplace",
    description: "Shop products and check out in USDT",
  },
  {
    href: "/vendor/dashboard",
    label: "Independent Vendor Portal",
    description: "Manage manual store listings and orders",
  },
  {
    href: "/vendor/dropship",
    label: "CJ Dropshipping Portal",
    description: "CJ catalog, imports, and fulfillment",
  },
] as const;

type PortalNavHubProps = {
  /** Highlight the portal that matches the current area. */
  active?: "buyer" | "vendor" | "cj" | "admin";
  className?: string;
};

/**
 * Site-wide footer hub for switching between buyer, vendor, CJ, and admin.
 */
export function PortalNavHub({ active, className }: PortalNavHubProps) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-zinc-950">Portals</p>
      <p className="mt-1 text-xs text-zinc-500">
        Jump between buyer shopping and seller operations.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PORTAL_HUB_LINKS.map((link) => {
          const isActive =
            (active === "buyer" && link.href === "/") ||
            (active === "vendor" && link.href === "/vendor/dashboard") ||
            (active === "cj" && link.href === "/vendor/dropship");
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block rounded-xl border px-3 py-2.5 transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                <span className="block text-sm font-medium">{link.label}</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    isActive ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {link.description}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <AdminDashboardLink
            className={`block rounded-xl border px-3 py-2.5 transition ${
              active === "admin"
                ? "border-zinc-900 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <span className="block text-sm font-medium">Admin Dashboard</span>
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
  );
}
