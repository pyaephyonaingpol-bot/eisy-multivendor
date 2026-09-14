import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getSessionProfile } from "@/lib/auth/session";

const nav = [
  { href: "/products", label: "Products" },
  { href: "/vendors", label: "Vendors" },
  { href: "/cart", label: "Cart" },
  { href: "/account/wallet", label: "Wallet" },
];

export async function Header() {
  const session = await getSessionProfile();

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
          {session?.role === "customer" ? (
            <Link href="/vendor/apply" className="hover:text-zinc-950">
              Sell with us
            </Link>
          ) : null}
          {session?.role === "vendor" || session?.role === "admin" ? (
            <Link href="/vendor/dashboard" className="hover:text-zinc-950">
              Vendor
            </Link>
          ) : null}
          {session?.role === "admin" ? (
            <Link href="/admin/dashboard" className="hover:text-zinc-950">
              Admin
            </Link>
          ) : null}
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[10rem] truncate text-zinc-500 sm:inline">
                {session.profile?.full_name ?? session.email}
              </span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-white hover:bg-zinc-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-zinc-500">
        <p>© 2026 EISY Marketplace</p>
        <div className="flex gap-4">
          <Link href="/vendor/apply">Become a vendor</Link>
          <Link href="/admin/dashboard">Admin</Link>
        </div>
      </div>
    </footer>
  );
}
