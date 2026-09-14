import Link from "next/link";
import { MARKETPLACE_CURRENCY } from "@/lib/money";
import { getSessionProfile } from "@/lib/auth/session";

export default async function CartPage() {
  const session = await getSessionProfile();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-700">
        <p>
          Marketplace checkout settles exclusively in{" "}
          <strong>{MARKETPLACE_CURRENCY}</strong>. Product prices are listed in USDT and
          paid from your USDT wallet balance.
        </p>
        <p className="mt-3 text-zinc-500">
          MMK cannot be used for deposits or checkout. Vendors may still withdraw
          available earnings to MMK from their wallet if they prefer local currency.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {session ? (
            <Link
              href="/account/wallet"
              className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Open USDT wallet
            </Link>
          ) : (
            <Link
              href="/login?next=/cart"
              className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Sign in to pay with USDT
            </Link>
          )}
          <Link
            href="/products"
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
