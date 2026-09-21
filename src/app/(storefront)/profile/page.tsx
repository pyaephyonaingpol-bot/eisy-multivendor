import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyerAddressBook } from "@/components/profile/buyer-address-book";
import { ProfileForm } from "@/components/profile/profile-form";
import { listBuyerAddresses } from "@/lib/addresses/queries";
import { getSessionProfile } from "@/lib/auth/session";
import { getCurrentUserProfile } from "@/lib/profiles/queries";
import { BUYER_COUNTRY_OPTIONS } from "@/lib/sourcing/constants";

export const dynamic = "force-dynamic";

function countryLabel(code: string | null) {
  if (!code) return "Not set";
  const match = BUYER_COUNTRY_OPTIONS.find((option) => option.code === code);
  return match ? `${match.label} (${code})` : code;
}

export default async function ProfilePage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/profile");
  }

  const result = await getCurrentUserProfile();

  if (!result.ok) {
    return (
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-zinc-600">
            Your account details from Supabase Auth and the{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
              profiles
            </code>{" "}
            table.
          </p>
        </div>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {result.error}
        </p>
        <Link href="/login?next=/profile" className="text-sm underline">
          Sign in again
        </Link>
      </section>
    );
  }

  const { profile } = result;
  const addresses = await listBuyerAddresses(profile.id);
  const defaultAddress =
    addresses.find((address) => address.is_default) ?? null;

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-zinc-600">
          View and update your buyer profile, preferred country, and default
          delivery address for checkout.
          {result.authEmail && result.authEmail !== profile.email ? (
            <> Signed in as {result.authEmail}.</>
          ) : null}
        </p>
      </div>

      <dl className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Name
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">
            {profile.full_name || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Email
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">{profile.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Role
          </dt>
          <dd className="mt-1 text-sm capitalize text-zinc-950">{profile.role}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Phone
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">{profile.phone || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Shipping country
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">
            {countryLabel(
              defaultAddress?.country_code ?? profile.preferred_country_code,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Default address
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">
            {defaultAddress
              ? `${defaultAddress.line1}, ${defaultAddress.city}`
              : "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Member since
          </dt>
          <dd className="mt-1 text-sm text-zinc-950">
            {new Date(profile.created_at).toLocaleDateString()}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Edit profile</h2>
        <ProfileForm profile={profile} />
      </div>

      <BuyerAddressBook
        addresses={addresses}
        defaultCountry={
          profile.preferred_country_code ??
          defaultAddress?.country_code ??
          "MM"
        }
      />

      <p className="text-sm text-zinc-500">
        Need your balance?{" "}
        <Link href="/account/wallet" className="underline hover:text-zinc-800">
          Open wallet
        </Link>
      </p>
    </section>
  );
}
