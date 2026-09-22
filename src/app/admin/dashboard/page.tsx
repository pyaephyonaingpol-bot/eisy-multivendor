import Link from "next/link";
import { countOpenDisputes } from "@/lib/disputes/queries";
import { listOrdersForAdmin } from "@/lib/orders/queries";
import { listPendingDeposits, listPendingWithdrawals } from "@/lib/wallets/queries";
import { listVendorsForAdmin, listVendorsForKycAdmin } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    pendingVendors,
    pendingKyc,
    openDisputes,
    pendingDeposits,
    pendingWithdrawals,
    heldEscrow,
  ] = await Promise.all([
    listVendorsForAdmin("pending"),
    listVendorsForKycAdmin("pending"),
    countOpenDisputes(),
    listPendingDeposits(),
    listPendingWithdrawals(),
    listOrdersForAdmin({ payoutStatus: "held", limit: 200 }),
  ]);

  const cards = [
    {
      label: "Pending vendors",
      value: pendingVendors.length,
      href: "/admin/vendors?status=pending",
      cta: "Review applications",
    },
    {
      label: "Pending KYC",
      value: pendingKyc.length,
      href: "/admin/kyc?status=pending",
      cta: "Review identity docs",
    },
    {
      label: "Open disputes",
      value: openDisputes,
      href: "/admin/disputes?status=open",
      cta: "Resolve disputes",
    },
    {
      label: "Escrow held",
      value: heldEscrow.length,
      href: "/admin/orders?escrow=escrow_held",
      cta: "Review seller orders",
    },
    {
      label: "Pending deposits",
      value: pendingDeposits.length,
      href: "/admin/wallets",
      cta: "Review USDT deposits",
    },
    {
      label: "Pending withdrawals",
      value: pendingWithdrawals.length,
      href: "/admin/withdrawals",
      cta: "Approve payouts",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-zinc-600">
          KYC review, dispute resolution, wallet monitoring, and role management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.href}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {card.value}
            </p>
            <Link
              href={card.href}
              className="mt-4 inline-flex text-sm font-medium underline"
            >
              {card.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
        Quick links:{" "}
        <Link href="/admin/transactions" className="underline">
          Transactions
        </Link>
        {" · "}
        <Link href="/admin/users" className="underline">
          User roles
        </Link>
        {" · "}
        <Link href="/admin/fees" className="underline">
          Fees
        </Link>
        {" · "}
        <Link href="/admin/integrations" className="underline">
          Supplier APIs
        </Link>
        {" · "}
        <Link href="/admin/categories" className="underline">
          Categories
        </Link>
      </div>
    </div>
  );
}
