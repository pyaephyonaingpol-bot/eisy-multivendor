import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getSessionProfile } from "@/lib/auth/session";
import { listWalletsForUser } from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getSessionProfile();
  let usdtAvailable: number | null = null;

  if (session) {
    const wallets = await listWalletsForUser(session.userId);
    const usdt = wallets.find((wallet) => wallet.currency === "USDT");
    usdtAvailable = usdt?.available_balance ?? 0;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <p className="text-zinc-600">
          Pay from your USDT wallet. Orders are created per vendor and marked paid after a
          successful debit.
        </p>
      </div>
      <CheckoutForm isSignedIn={Boolean(session)} usdtAvailable={usdtAvailable} />
    </section>
  );
}
