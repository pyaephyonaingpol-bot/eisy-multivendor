export default function VendorLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-4 px-4 py-10" aria-hidden>
      <div className="h-4 w-32 rounded bg-zinc-200" />
      <div className="h-9 w-64 rounded bg-zinc-200" />
      <div className="h-5 w-full max-w-xl rounded bg-zinc-200" />
      <div className="mt-6 h-48 w-full max-w-lg rounded-xl bg-zinc-200" />
    </div>
  );
}
