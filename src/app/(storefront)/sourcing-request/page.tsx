import Link from "next/link";
import { redirect } from "next/navigation";
import { SourcingRequestForm } from "@/components/sourcing/sourcing-request-form";
import { getSessionProfile } from "@/lib/auth/session";
import { listSourcingRequestsForBuyer } from "@/lib/sourcing-requests/queries";

export const dynamic = "force-dynamic";

/**
 * Buyer-facing product sourcing request — find / import candidates via CJ.
 */
export default async function SourcingRequestPage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/sourcing-request");
  }

  const recent = await listSourcingRequestsForBuyer(session.userId);

  return (
    <section className="mx-auto max-w-xl space-y-6 py-2">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Buyer tools
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Sourcing request
        </h1>
        <p className="text-sm text-zinc-600">
          Can&apos;t find a product in the marketplace? Submit a request and we
          will look it up on CJ Dropshipping and our supplier network.
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/products" className="font-medium underline">
            Browse products
          </Link>
          {" · "}
          <Link href="/profile" className="font-medium underline">
            Profile
          </Link>
        </p>
      </header>

      <SourcingRequestForm recent={recent} />
    </section>
  );
}
