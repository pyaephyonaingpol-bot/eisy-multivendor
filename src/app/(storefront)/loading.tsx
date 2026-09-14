export default function StorefrontLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-4 w-40 rounded bg-zinc-200" />
      <div className="h-10 w-3/4 max-w-xl rounded bg-zinc-200" />
      <div className="h-6 w-full max-w-lg rounded bg-zinc-200" />
      <div className="flex gap-3 pt-2">
        <div className="h-10 w-36 rounded-full bg-zinc-200" />
        <div className="h-10 w-40 rounded-full bg-zinc-200" />
      </div>
    </div>
  );
}
