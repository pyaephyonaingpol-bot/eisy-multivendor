import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyerAddressBook } from "@/components/profile/buyer-address-book";
import { ProfileForm } from "@/components/profile/profile-form";
import { listBuyerAddresses } from "@/lib/addresses/queries";
import { getSessionProfile } from "@/lib/auth/session";
import { getCurrentUserProfile } from "@/lib/profiles/queries";

export const dynamic = "force-dynamic";

/**
 * Profile workspace — personal details + delivery addresses.
 * Workspace switching is only via the header Account menu.
 */
export default async function ProfilePage() {
  const session = await getSessionProfile();
  if (!session) {
    redirect("/login?next=/profile");
  }

  const result = await getCurrentUserProfile();

  if (!result.ok) {
    return (
      <section className="mx-auto max-w-xl space-y-4 py-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Profile
        </h1>
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
    <section className="mx-auto max-w-xl space-y-10 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Profile
        </h1>
        <p className="text-sm text-zinc-500">{profile.email}</p>
      </header>

      <ProfileForm profile={profile} />

      <div className="border-t border-zinc-100 pt-10">
        <BuyerAddressBook
          addresses={addresses}
          defaultCountry={
            profile.preferred_country_code ??
            defaultAddress?.country_code ??
            "MM"
          }
        />
      </div>
    </section>
  );
}
