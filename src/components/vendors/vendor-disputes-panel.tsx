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

type Channel = "manual" | "cj";

type Props = {
  channel: Channel;
  title: string;
  eyebrow: string;
  description: string;
  emptyLabel: string;
};

/**
 * Single-channel disputes list — used by Independent Vendor and CJ portals.
 * Never renders a channel switcher (portals stay fully separate).
 */
export async function VendorDisputesPanel({
  channel,
  title,
  eyebrow,
  description,
  emptyLabel,
}: Props) {
  const session = await getSessionProfile();
  if (!session) {
    redirect(
      channel === "cj"
        ? "/login?next=/vendor/dropship/disputes"
        : "/login?next=/vendor/disputes",
    );
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    redirect("/vendor/apply");
  }

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

  const rows =
    (disputes as Array<{
      id: string;
      order_id: string;
      reason: string;
      status: string;
      created_at: string;
      description: string | null;
    }> | null) ?? [];

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const isCj = channel === "cj";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p
          className={`text-xs font-semibold uppercase tracking-wider ${
            isCj ? "text-sky-800" : "text-zinc-500"
          }`}
        >
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-zinc-600">{description}</p>
      </div>

      {rows.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed px-6 py-10 text-center ${
            isCj ? "border-sky-200 bg-sky-50/40" : "border-zinc-300 bg-white"
          }`}
        >
          <p className="text-zinc-700">{emptyLabel}</p>
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
                      isCj
                        ? "bg-sky-50 text-sky-900 ring-sky-200"
                        : "bg-zinc-100 text-zinc-700 ring-zinc-200"
                    }`}
                  >
                    {isCj ? "CJ" : "Custom"}
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
                {order ? (
                  <p className="text-xs text-zinc-400">
                    <Link
                      href={
                        isCj
                          ? "/vendor/dropship/orders"
                          : "/vendor/orders"
                      }
                      className="underline"
                    >
                      View {isCj ? "CJ" : "vendor"} orders
                    </Link>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
