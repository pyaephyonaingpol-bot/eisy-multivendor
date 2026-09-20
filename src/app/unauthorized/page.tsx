import Link from "next/link";

type UnauthorizedPageProps = {
  searchParams: Promise<{ from?: string }>;
};

export default async function UnauthorizedPage({
  searchParams,
}: UnauthorizedPageProps) {
  const { from } = await searchParams;
  const isAdmin = from === "admin";

  return (
    <section className="mx-auto flex max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="text-sm text-zinc-600">
        {isAdmin
          ? "The Admin Dashboard is only available to accounts with the admin role."
          : "You do not have permission to view that page."}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={isAdmin ? "/login?next=/admin/dashboard" : "/login"}
          className="rounded-full bg-zinc-950 px-4 py-2 text-white hover:bg-zinc-800"
        >
          Sign in
        </Link>
        <Link
          href="/"
          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-zinc-800 hover:bg-zinc-50"
        >
          Back to storefront
        </Link>
      </div>
    </section>
  );
}
