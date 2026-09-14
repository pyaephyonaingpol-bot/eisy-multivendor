export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();

  if (!url || !anonKey) {
    return null;
  }

  // Reject unconfigured placeholders so createClient is not called with junk.
  if (
    url.includes("your-project-ref") ||
    anonKey === "your-anon-key" ||
    anonKey === "your-publishable-key"
  ) {
    return null;
  }

  return { url, anonKey };
}

export function getSupabaseConfigError(): string {
  return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel project environment.";
}
