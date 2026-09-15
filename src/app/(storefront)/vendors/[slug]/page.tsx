import { redirect } from "next/navigation";

type VendorPageProps = {
  params: Promise<{ slug: string }>;
};

/** Legacy /vendors/[slug] → canonical /store/[slug] storefront. */
export default async function LegacyVendorStoreRedirect({ params }: VendorPageProps) {
  const { slug } = await params;
  redirect(`/store/${slug}`);
}
