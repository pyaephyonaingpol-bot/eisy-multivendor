import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/layout/account-menu";
import { VendorProfileForm } from "@/components/vendors/vendor-profile-form";
import { canAccessVendor, getSessionProfile } from "@/lib/auth/session";
import { getVendorForOwner } from "@/lib/vendors/queries";

export const dynamic = "force-dynamic";

const profileLinks = [
  {
    href: "/vendor/kyc",
    title: "KYC",
    body: "Submit identity documents for verification.",
  },
  {
    href: "/vendor/profile/email",
    title: "Email",
    body: "Update your store contact email.",
  },
  {
    href: "/vendor/profile/phone",
    title: "Phone",
    body: "Keep your ops phone number current.",
  },
  {
    href: "/vendor/profile/address",
    title: "Address",
    body: "Registered business address for KYC and payouts.",
  },
] as const;

export default async function VendorProfilePage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/vendor/profile");
  }
  if (!canAccessVendor(session.role)) {
    redirect("/");
  }

  const vendor = await getVendorForOwner(session.userId);
  if (!vendor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile & settings
        </h1>
        <p className="text-zinc-600">
          Apply as a vendor first, then update KYC, email, phone, and address.
        </p>
        <Link
          href="/vendor/apply"
          className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply as a vendor
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Profile & settings
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile & settings
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Identity and contact details for your vendor account. Store branding
          lives under Vendor → Store.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
        }
      >
        <AccountMenu
          active="profile"
          className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5"
        />
      </Suspense>

      <div className="grid gap-3 sm:grid-cols-2">
        {profileLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <h2 className="text-sm font-semibold text-zinc-950">{item.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{item.body}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p>
          Store status: <strong>{vendor.status}</strong>
          {" · "}
          KYC: <strong>{vendor.kyc_status ?? "unsubmitted"}</strong>
          {" · "}
          <Link href="/vendor/wallet?portal=vendor" className="font-medium underline">
            Wallet
          </Link>
          {" · "}
          <Link href="/vendor/apply" className="font-medium underline">
            Application
          </Link>
        </p>
      </div>

      <section className="space-y-4 border-t border-zinc-200 pt-8">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Full profile</h2>
          <p className="text-sm text-zinc-600">
            Edit all store and contact fields in one place.
          </p>
        </div>
        <VendorProfileForm vendor={vendor} />
      </section>
    </div>
  );
}
