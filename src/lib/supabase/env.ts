type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function isPlaceholderUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("your-project-ref") ||
    lower.includes("example.supabase.co") ||
    lower === "https://placeholder.supabase.co"
  );
}

function isPlaceholderKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === "your-anon-key" ||
    lower === "your-publishable-key" ||
    lower === "your-service-role-key" ||
    lower.startsWith("your-") ||
    lower.includes("replace-me")
  );
}

function normalizeSupabaseUrl(url: string): string | null {
  const cleaned = url.replace(/\/+$/, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

function looksLikePublicKey(key: string): boolean {
  // Legacy JWT anon key, or newer publishable key (sb_publishable_…).
  return (
    key.startsWith("eyJ") ||
    key.startsWith("sb_publishable_") ||
    key.length >= 20
  );
}

/**
 * Resolve public Supabase URL + anon/publishable key.
 * Accepts Vercel aliases without the NEXT_PUBLIC_ prefix so projects that only
 * set SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY still work
 * (especially after next.config maps them into the client bundle).
 *
 * Never uses service_role / secret keys.
 */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const urlRaw = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  const anonKey = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );

  if (!urlRaw || !anonKey) {
    return null;
  }

  if (isPlaceholderUrl(urlRaw) || isPlaceholderKey(anonKey)) {
    return null;
  }

  const url = normalizeSupabaseUrl(urlRaw);
  if (!url || !looksLikePublicKey(anonKey)) {
    return null;
  }

  return { url, anonKey };
}

/** Which public env slots are present (no secret values). */
export function getSupabaseEnvDiagnostics(): {
  hasUrl: boolean;
  hasAnonKey: boolean;
  urlSource: string | null;
  keySource: string | null;
} {
  const urlSources: Array<[string, string | undefined]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_URL", process.env.SUPABASE_URL],
  ];
  const keySources: Array<[string, string | undefined]> = [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ],
    ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
    ["SUPABASE_PUBLISHABLE_KEY", process.env.SUPABASE_PUBLISHABLE_KEY],
  ];

  const urlHit = urlSources.find(([, v]) => Boolean(v?.trim()));
  const keyHit = keySources.find(([, v]) => Boolean(v?.trim()));

  return {
    hasUrl: Boolean(urlHit),
    hasAnonKey: Boolean(keyHit),
    urlSource: urlHit?.[0] ?? null,
    keySource: keyHit?.[0] ?? null,
  };
}

export function getSupabaseConfigError(): string {
  const d = getSupabaseEnvDiagnostics();
  if (!d.hasUrl && !d.hasAnonKey) {
    return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL + SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY) in the Vercel project environment, then redeploy.";
  }
  if (!d.hasUrl) {
    return "Supabase URL is missing. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL in Vercel, then redeploy.";
  }
  if (!d.hasAnonKey) {
    return "Supabase anon/publishable key is missing. Set NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY) in Vercel, then redeploy.";
  }
  return "Supabase environment variables look invalid (placeholder or malformed). Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.";
}
