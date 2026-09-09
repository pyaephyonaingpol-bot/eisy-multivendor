import Link from "next/link";

const nav = [
  { href: "/products", label: "Products" },
  { href: "/vendors", label: "Vendors" },
  { href: "/cart", label: "Cart" },
];

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          EISY Marketplace
        </Link>
        <nav className="flex items-center gap-6 text-sm text-zinc-600">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-950">
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="rounded-full bg-zinc-950 px-4 py-1.5 text-white hover:bg-zinc-800">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-zinc-500">
        <p>© {new Date().getFullYear()} EISY Marketplace</p>
        <div className="flex gap-4">
          <Link href="/vendor/dashboard">Vendor</Link>
          <Link href="/admin/dashboard">Admin</Link>
        </div>
      </div>
    </footer>
  );
}
