"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCart } from "@/components/storefront/cart-provider";

type TabId = "home" | "categories" | "deals" | "account" | "cart";

const tabs: Array<{
  id: TabId;
  href: string;
  label: string;
}> = [
  { id: "home", href: "/", label: "Home" },
  { id: "categories", href: "/products", label: "Categories" },
  { id: "deals", href: "/products?deals=1", label: "Deals" },
  { id: "account", href: "/profile", label: "Account" },
  { id: "cart", href: "/cart", label: "Cart" },
];

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
    case "home":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
          />
        </svg>
      );
    case "categories":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4.75h6.5V11H4V4.75Zm9.5 0H20V11h-6.5V4.75ZM4 13h6.5v6.25H4V13Zm9.5 0H20v6.25h-6.5V13Z"
          />
        </svg>
      );
    case "deals":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3.5 13.8 9H20l-5 3.6L16.8 18 12 14.7 7.2 18 9 12.6 4 9h6.2L12 3.5Z"
          />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.75c-3.4 0-6.25 1.7-6.25 3.75V19h12.5v-1.5c0-2.05-2.85-3.75-6.25-3.75Z"
          />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.5 5h1.6l1.1 10.2a1.5 1.5 0 0 0 1.5 1.3h9.6a1.5 1.5 0 0 0 1.5-1.2L20 8.5H7"
          />
          <circle cx="9.5" cy="19" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="19" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

/**
 * Fixed bottom tab bar — Home, Categories, Deals, Account, Cart.
 * Cart opens the drawer when already browsing (faster than full navigation).
 */
export function BuyerBottomNav() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const { itemCount, openDrawer } = useCart();
  const dealsMode = searchParams.get("deals") === "1";

  let activeId: TabId = "home";
  if (pathname.startsWith("/cart") || pathname.startsWith("/checkout")) {
    activeId = "cart";
  } else if (
    pathname.startsWith("/profile") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/account")
  ) {
    activeId = "account";
  } else if (pathname.startsWith("/products") && dealsMode) {
    activeId = "deals";
  } else if (pathname.startsWith("/products") || pathname.startsWith("/vendors")) {
    activeId = "categories";
  } else if (pathname === "/") {
    activeId = "home";
  }

  return (
    <nav
      aria-label="Buyer marketplace"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--market-line)] bg-[var(--market-surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto grid h-16 max-w-6xl grid-cols-5 px-1">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const className = `relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ${
            active
              ? "text-[var(--market-accent)]"
              : "text-[var(--market-muted)] hover:text-[var(--market-ink)]"
          }`;

          if (tab.id === "cart") {
            return (
              <li key={tab.id} className="flex">
                <button
                  type="button"
                  onClick={openDrawer}
                  className={`${className} w-full`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="relative">
                    <TabIcon id={tab.id} />
                    {itemCount > 0 ? (
                      <span className="absolute -right-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--market-accent)] px-1 text-[9px] font-semibold text-white">
                        {itemCount > 99 ? "99+" : itemCount}
                      </span>
                    ) : null}
                  </span>
                  {tab.label}
                </button>
              </li>
            );
          }

          return (
            <li key={tab.id} className="flex">
              <Link
                href={tab.href}
                className={`${className} w-full`}
                aria-current={active ? "page" : undefined}
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
