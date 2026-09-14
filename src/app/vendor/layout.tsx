import Link from "next/link";

const links = [
  { href: "/vendor/dashboard", label: "Overview" },
  { href: "/vendor/apply", label: "Application" },
  { href: "/vendor/products", label: "Products" },
  { href: "/vendor/orders", label: "Orders" },
];

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8">
      <aside className="w-48 shrink-0 space-y-4">
        <p className="text-sm font-semibold">Vendor</p>
        <nav className="flex flex-col gap-2 text-sm text-zinc-600">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-950">
              {item.label}
            </Link>
          ))}
          <Link href="/" className="pt-4 text-zinc-400 hover:text-zinc-950">
            ← Storefront
          </Link>
        </nav>
      </aside>
      <section className="flex-1">{children}</section>
    </div>
  );
}
