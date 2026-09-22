import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
  }

  if (!getSupabasePublicEnv()) {
    return NextResponse.redirect(new URL("/login?error=auth_config", origin));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        await supabase.rpc("ensure_own_profile");
      } catch {
        // RPC may be missing until the linkage migration is applied.
      }
      return NextResponse.redirect(new URL(redirectTo, origin));
    }
  } catch {
    // Fall through to the error redirect below.
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
