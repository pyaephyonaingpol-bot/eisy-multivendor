import { redirect } from "next/navigation";
import { BuyerOrderList } from "@/components/orders/buyer-order-list";
import { getSessionProfile } from "@/lib/auth/session";
import { listOrdersForCustomer } from "@/lib/orders/queries";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/orders");
  }

  const orders = await listOrdersForCustomer(session.userId);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          Your orders
        </h1>
        <p className="text-sm text-zinc-600">
          Track USDT payments, fulfillment status, and shipping numbers for
          every purchase.
        </p>
      </div>
      <BuyerOrderList orders={orders} />
    </div>
  );
}
