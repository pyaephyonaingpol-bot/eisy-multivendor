import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ channel?: string }>;
};

/**
 * Legacy support URL — redirect into the correct independent portal.
 * No mixed channel UI.
 */
export default async function VendorSupportRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  if (params.channel === "cj") {
    redirect("/vendor/dropship/disputes");
  }
  redirect("/vendor/disputes");
}
