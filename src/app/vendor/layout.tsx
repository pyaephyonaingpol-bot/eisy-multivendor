import Link from "next/link";

const links = [
  { href: "/vendor/dashboard", label: "Overview" },
  { href: "/vendor/settings", label: "Store branding" },
  { href: "/vendor/apply", label: "Application" },
  { href: "/vendor/products", label: "Products" },
  { href: "/vendor/sourcing", label: "Sourcing" },
  { href: "/vendor/import", label: "Import" },
  { href: "/vendor/integrations", label: "Integrations" },
  { href: "/vendor/fees", label: "Fees" },
  { href: "/vendor/wallet", label: "Wallet" },
  { href: "/vendor/orders", label: "Orders" },
];

export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-8 md:py-8">
      <aside className="w-full shrink-0 space-y-3 md:w-48 md:space-y-4">
        <p className="text-sm font-semibold">Vendor</p>
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
            ← Storefront
          </Link>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
