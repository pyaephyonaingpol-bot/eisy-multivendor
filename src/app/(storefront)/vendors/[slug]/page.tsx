type VendorPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function VendorStorePage({ params }: VendorPageProps) {
  const { slug } = await params;

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Vendor store</h1>
      <p className="text-zinc-600">Slug: {slug}</p>
    </section>
  );
}
