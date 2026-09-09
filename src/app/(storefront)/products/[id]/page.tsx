type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Product</h1>
      <p className="text-zinc-600">Product id: {id}</p>
    </section>
  );
}
