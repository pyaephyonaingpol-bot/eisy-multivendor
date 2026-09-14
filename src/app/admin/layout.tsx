import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8">
      <aside className="w-48 shrink-0 space-y-4">
        <p className="text-sm font-semibold">Admin</p>
        <nav className="flex flex-col gap-2 text-sm text-zinc-600">
          <Link href="/admin/dashboard" className="hover:text-zinc-950">
            Overview
          </Link>
          <Link href="/admin/vendors" className="hover:text-zinc-950">
            Vendors
          </Link>
          <Link href="/admin/categories" className="hover:text-zinc-950">
            Categories
          </Link>
          <Link href="/admin/wallets" className="hover:text-zinc-950">
            Wallets
          </Link>
          <Link href="/" className="pt-4 text-zinc-400 hover:text-zinc-950">
            ← Storefront
          </Link>
        </nav>
      </aside>
      <section className="flex-1">{children}</section>
    </div>
  );
}
