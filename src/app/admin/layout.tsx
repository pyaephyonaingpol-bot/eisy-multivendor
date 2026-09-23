import Link from "next/link";
import { SitePortalFooter } from "@/components/layout/site-portal-footer";

const links = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/orders?channel=manual", label: "Manual orders" },
  { href: "/admin/orders?channel=cj", label: "CJ orders" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/kyc", label: "KYC review" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/disputes?channel=manual", label: "Manual disputes" },
  { href: "/admin/disputes?channel=cj", label: "CJ disputes" },
  { href: "/admin/sourcing-requests", label: "Sourcing requests" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/wallets", label: "Wallets" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/fees", label: "Fees" },
  { href: "/admin/integrations", label: "Supplier APIs" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full max-w-full flex-col overflow-x-hidden">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-4 overflow-x-hidden px-4 py-6 md:flex-row md:gap-8 md:py-8">
        <aside className="w-full min-w-0 shrink-0 space-y-3 md:w-48 md:space-y-4">
          <p className="text-sm font-semibold">Admin</p>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm text-zinc-600 [scrollbar-width:none] md:flex-col md:gap-2 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:border-zinc-300 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-zinc-400 hover:text-zinc-950 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-4"
            >
              ← Home
            </Link>
          </nav>
        </aside>
        <section className="min-w-0 max-w-full flex-1 overflow-x-hidden break-words">
          {children}
        </section>
      </div>
      <SitePortalFooter />
    </div>
  );
}
