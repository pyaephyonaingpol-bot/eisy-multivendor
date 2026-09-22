import { CheckoutForm } from "@/components/storefront/checkout-form";
import { getDefaultBuyerAddress } from "@/lib/addresses/queries";
import { getSessionProfile } from "@/lib/auth/session";
import { getBuyerSourcingContext } from "@/lib/sourcing/queries";
import { listWalletsForUser } from "@/lib/wallets/queries";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getSessionProfile();
  const defaultAddress = session
    ? await getDefaultBuyerAddress(session.userId)
    : null;
  const sourcing = await getBuyerSourcingContext(
    defaultAddress?.country_code ??
      session?.profile?.preferred_country_code ??
      null,
  );
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
          Pay from your USDT wallet or send USDT (TRC-20). Wallet checkout pays
          instantly; on-chain payments stay pending until the webhook confirms
          the transfer and runs the profit split.
        </p>
      </div>
      <CheckoutForm
        isSignedIn={Boolean(session)}
        usdtAvailable={usdtAvailable}
        defaultCountry={
          defaultAddress?.country_code ?? sourcing.countryCode
        }
        defaultAddress={
          defaultAddress
            ? {
                fullName: defaultAddress.full_name,
                phone: defaultAddress.phone,
                line1: defaultAddress.line1,
                line2: defaultAddress.line2,
                city: defaultAddress.city,
                region: defaultAddress.region,
                postalCode: defaultAddress.postal_code,
                countryCode: defaultAddress.country_code,
              }
            : null
        }
      />
    </section>
  );
}
