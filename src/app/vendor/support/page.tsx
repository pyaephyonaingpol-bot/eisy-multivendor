import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { formatMoney } from "@/lib/money";
import {
  listCjOrdersForVendor,
  listManualOrdersForVendor,
} from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/server";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ channel?: string }>;
};

/**
 * Vendor complaints hub — split manual vs CJ dispute queues for the seller.
 */
export default async function VendorSupportPage({ searchParams }: Props) {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/support");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    redirect("/vendor/apply");
  }

  const params = await searchParams;
  const channel =
    params.channel === "cj" || params.channel === "manual"
      ? params.channel
      : "manual";

  const orders =
    channel === "cj"
      ? await listCjOrdersForVendor(vendor.id)
      : await listManualOrdersForVendor(vendor.id);

  const orderIds = orders.map((o) => o.id);
  const supabase = await createClient();
  const { data: disputes } =
    orderIds.length > 0
      ? await supabase
          .from("disputes")
          .select("*")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as unknown[] };

  const rows = (disputes as Array<{
    id: string;
    order_id: string;
    reason: string;
    status: string;
    created_at: string;
    description: string | null;
  }> | null) ?? [];

  const orderById = new Map(orders.map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p
          className={`text-xs font-semibold uppercase tracking-wider ${
            channel === "cj" ? "text-sky-800" : "text-zinc-500"
          }`}
        >
          {channel === "cj"
            ? "Dropshipper · CJ support"
            : "Vendor · Manual support"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Complaints &amp; support
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Buyer disputes for{" "}
          {channel === "cj"
            ? "CJ Dropshipping orders"
            : "manual / custom-sourced orders"}
          . The two queues stay separate so CJ API issues never mix with local
          fulfillment complaints.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/vendor/support?channel=manual"
          className={`rounded-full border px-3 py-1 ${
            channel === "manual"
              ? "border-zinc-900 bg-zinc-950 text-white"
              : "border-zinc-200 hover:bg-zinc-50"
          }`}
        >
          Manual / custom
        </Link>
        <Link
          href="/vendor/support?channel=cj"
          className={`rounded-full border px-3 py-1 ${
            channel === "cj"
              ? "border-sky-700 bg-sky-950 text-white"
              : "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100"
          }`}
        >
          CJ Dropshipping
        </Link>
      </div>

      {rows.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed px-6 py-10 text-center ${
            channel === "cj"
              ? "border-sky-200 bg-sky-50/40"
              : "border-zinc-300 bg-white"
          }`}
        >
          <p className="text-zinc-700">
            No {channel === "cj" ? "CJ" : "manual"} complaints yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {rows.map((dispute) => {
            const order = orderById.get(dispute.order_id);
            return (
              <li key={dispute.id} className="space-y-1 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-950">
                    Order {dispute.order_id.slice(0, 8)}…
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${
                      channel === "cj"
                        ? "bg-sky-50 text-sky-900 ring-sky-200"
                        : "bg-zinc-100 text-zinc-700 ring-zinc-200"
                    }`}
                  >
                    {channel === "cj" ? "CJ" : "Manual"}
                  </span>
                  <span className="text-xs text-zinc-500">{dispute.status}</span>
                </div>
                <p className="text-sm text-zinc-600">
                  {dispute.reason.replaceAll("_", " ")}
                  {order
                    ? ` · ${formatMoney(Number(order.total), order.currency)}`
                    : ""}
                </p>
                {dispute.description ? (
                  <p className="text-sm text-zinc-500">{dispute.description}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
