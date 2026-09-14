function FormSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-zinc-100" />
      ))}
      <div className="h-10 animate-pulse rounded-lg bg-zinc-200" />
    </div>
  );
}

export { FormSkeleton };
